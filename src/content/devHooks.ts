import { runSync } from '@/core/sync';
import { createDexieSyncStore, db } from '@/core/db';
import { loadIndexableConversations, loadOrBuildIndex } from '@/core/searchStore';
import { getChatOrganization, getConversation, listConversations } from '@/api/claudeAdapter';
import { unzipSync } from 'fflate';
import { createPrompt } from '@/core/prompts';
import { loadFolders } from '@/core/folders';
import { getEntitlements, setPro } from '@/core/entitlements';
import { deriveStatus, readLicenseRecord, revalidateLicense } from '@/core/licenseState';
import {
  createDexieExportSource,
  exportConversation,
  exportConversationsZip,
} from '@/core/exporter';
import { dumpAllStorageForDebug, setLocal } from '@/shared/storage';
import { updateSettings } from '@/shared/settings';

/**
 * DEV-ONLY postMessage bridge for manual verification against real claude.ai.
 *
 * Compiled in only when the build runs with VITE_DEV_HOOKS=1; a normal
 * `pnpm build` tree-shakes this module away entirely (the import site is behind
 * a compile-time env check), so it cannot ship by accident.
 *
 * Why it exists: sync deliberately has no UI trigger until the M5 onboarding
 * consent screen, and chrome.storage is invisible from the page world. This
 * bridge lets a verifier (human in the console, or automation) drive a real
 * backfill and inspect state:
 *
 *   window.postMessage({ type: 'CLAUDEGOD_DEV_CMD', id: 1, cmd: 'dump' }, '*')
 *   window.addEventListener('message', e =>
 *     e.data?.type === 'CLAUDEGOD_DEV_RESULT' && console.log(e.data))
 *
 * Commands: dump, dbStats, runSync, setThreshold, setUsageCache, licenseState,
 * ageLicense, revalidateLicense,
 * clearAlertMarker, seedPrompt, folders, exportChat, setPro, exportZip.
 */

interface DevCommand {
  type: 'CLAUDEGOD_DEV_CMD';
  id: number;
  cmd: string;
  arg?: unknown;
}

async function handle(cmd: string, arg: unknown): Promise<unknown> {
  switch (cmd) {
    case 'dump':
      return dumpAllStorageForDebug();
    case 'dbStats':
      return {
        conversations: await db.conversations.count(),
        indexed: await db.conversations.where('indexedAt').notEqual('').count(),
        messages: await db.messages.count(),
        artifacts: await db.artifacts.count(),
      };
    case 'searchDebug': {
      // Lengths and counts only — conversation text never leaves the device,
      // and never enters a debugging transcript either (api-notes redaction).
      const sample = await db.messages.limit(500).toArray();
      const nonEmpty = sample.filter((m) => m.text.length > 0).length;
      const convs = await loadIndexableConversations();
      const index = await loadOrBuildIndex();
      return {
        sampledMessages: sample.length,
        nonEmptyTexts: nonEmpty,
        avgTextLength: Math.round(
          sample.reduce((n, m) => n + m.text.length, 0) / Math.max(1, sample.length),
        ),
        indexableConversations: convs.length,
        indexableMessages: convs.reduce((n, c) => n + c.messages.length, 0),
        documentCount: index.documentCount,
      };
    }
    case 'clearConversations': {
      // Forces the next runSync to be a true re-backfill (repair path).
      await db.conversations.clear();
      await db.messages.clear();
      await db.artifacts.clear();
      await db.syncState.clear();
      await db.searchMeta.clear();
      return 'cleared';
    }
    case 'runSync':
      return runSync({
        adapter: { getChatOrganization, listConversations, getConversation },
        store: createDexieSyncStore(),
      });
    case 'setThreshold':
      await updateSettings({ alertThresholdPercent: typeof arg === 'number' ? arg : 80 });
      return 'ok';
    case 'setUsageCache':
      await setLocal('usageCache', arg);
      return 'ok';
    case 'clearAlertMarker':
      await setLocal('usageAlert', null);
      return 'ok';
    case 'seedPrompt': {
      // The prompt library's own CRUD lives on the options page, which is not
      // reachable from a claude.ai tab; this seeds one so the slash picker can
      // be verified on the real composer.
      const draft = arg as { title?: string; body?: string } | null;
      const prompt = await createPrompt({
        title: draft?.title ?? 'Dev prompt',
        body: draft?.body ?? 'Summarise this thread in {{style}} style.',
      });
      return { id: prompt.id, title: prompt.title };
    }
    case 'folders':
      return (await loadFolders()).map((folder) => ({
        name: folder.name,
        color: folder.color,
        convIds: folder.convIds.length,
      }));
    case 'exportChat': {
      // Runs the real export path and reports its shape, without a download
      // dialog automation cannot dismiss.
      const file = await exportConversation(typeof arg === 'string' ? arg : '');
      return file ? { filename: file.filename, length: String(file.data).length } : null;
    }
    case 'licenseState': {
      // Reports the stored record without revealing the key itself.
      const record = await readLicenseRecord();
      return {
        hasRecord: record !== null,
        instanceId: record?.instanceId ?? null,
        lastValidatedAt: record?.lastValidatedAt ?? null,
        status: deriveStatus(record, new Date()),
        isPro: getEntitlements().isPro,
      };
    }
    case 'ageLicense': {
      // Rewinds lastValidatedAt so revalidation comes due without waiting a
      // week. `arg` is days; 8 lands past the 7-day check, 20 past the grace.
      const record = await readLicenseRecord();
      if (!record) return { error: 'no license record' };
      const days = typeof arg === 'number' ? arg : 8;
      const aged = new Date(Date.now() - days * 86400000).toISOString();
      await setLocal('licenseCache', { ...record, lastValidatedAt: aged });
      return { lastValidatedAt: aged, dueForRevalidation: true };
    }
    case 'revalidateLicense': {
      // Drives the real revalidation path: hits Dodo's validate endpoint and
      // applies the result. This is how the refund/revoke branch gets tested
      // without waiting for the weekly alarm.
      const state = await revalidateLicense();
      return { status: state.status, isPro: getEntitlements().isPro };
    }
    case 'setPro': {
      // Flips this tab's entitlements so Pro-gated paths (bulk export, prompt
      // variables) can be exercised before the M5 license client exists. In
      // memory only, and only in this context — it grants nothing, it just
      // lets the gated code run once.
      setPro(arg === true);
      return { isPro: getEntitlements().isPro };
    }
    case 'exportZip': {
      // Bulk export end to end, minus the download dialog: reports the ZIP's
      // size and entry list so the layout can be checked.
      const uuids = Array.isArray(arg)
        ? arg.filter((value): value is string => typeof value === 'string')
        : (await createDexieExportSource().listConversationUuids()).slice(0, 25);
      const file = await exportConversationsZip(uuids);
      const bytes = file.data as Uint8Array;
      return {
        filename: file.filename,
        conversations: uuids.length,
        bytes: bytes.length,
        entries: Object.keys(unzipSync(bytes)).slice(0, 8),
      };
    }
    default:
      return { error: `unknown command: ${cmd}` };
  }
}

export function installDevHooks(): void {
  window.addEventListener('message', (event) => {
    const data = event.data as DevCommand | null;
    if (event.source !== window || data?.type !== 'CLAUDEGOD_DEV_CMD') return;
    void handle(data.cmd, data.arg)
      .catch((error: unknown) => ({
        error: error instanceof Error ? error.message : String(error),
      }))
      .then((result) => {
        // JSON round-trip guarantees the payload is structured-cloneable.
        window.postMessage(
          {
            type: 'CLAUDEGOD_DEV_RESULT',
            id: data.id,
            result: JSON.parse(JSON.stringify(result ?? null)) as unknown,
          },
          '*',
        );
      });
  });
}
