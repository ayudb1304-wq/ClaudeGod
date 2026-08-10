import { runSync } from '@/core/sync';
import { createDexieSyncStore, db } from '@/core/db';
import { loadIndexableConversations, loadOrBuildIndex } from '@/core/searchStore';
import { getChatOrganization, getConversation, listConversations } from '@/api/claudeAdapter';
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
 * Commands: dump, dbStats, runSync, setThreshold, setUsageCache,
 * clearAlertMarker.
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
