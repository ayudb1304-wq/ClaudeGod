import { runSync, type SyncResult } from './sync';
import { createDexieSyncStore, db } from './db';
import { getChatOrganization, getConversation, listConversations } from '@/api/claudeAdapter';
import { loadIndexableConversations, persistIndex } from './searchStore';
import { SearchIndex } from './searchIndex';
import { getLocal, setLocal } from '@/shared/storage';

/**
 * Owns "run a real sync", so the popup, onboarding and future alarms all share
 * one path rather than each assembling the adapter and store themselves.
 *
 * Lives in core but only ever executes in the content script: `runSync` calls
 * the adapter, which needs the page's claude.ai session.
 */

export interface SyncSummary {
  lastCompletedAt: string | null;
  lastResult: SyncResult | null;
}

let inFlight: Promise<SyncResult> | null = null;

export function isSyncRunning(): boolean {
  return inFlight !== null;
}

export async function readSyncSummary(): Promise<SyncSummary> {
  const stored = await getLocal<SyncSummary>('syncSummary');
  return {
    lastCompletedAt: typeof stored?.lastCompletedAt === 'string' ? stored.lastCompletedAt : null,
    lastResult: stored?.lastResult ?? null,
  };
}

/**
 * Runs a backfill (or incremental pass) and rebuilds the search index.
 *
 * Concurrent calls share the in-flight promise. Two overlapping backfills would
 * fight over the same checkpoint row and double the request rate against
 * claude.ai, which the throttle is specifically there to prevent.
 */
export function startSync(): Promise<SyncResult> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const result = await runSync({
        adapter: { getChatOrganization, listConversations, getConversation },
        store: createDexieSyncStore(db),
      });

      // Rebuild rather than incrementally upsert: after a backfill the index is
      // stale for every conversation touched, and a full rebuild of a few
      // thousand chunks costs well under a second (measured in M2).
      if (result.indexed > 0 || result.completed) {
        const index = new SearchIndex();
        index.build(await loadIndexableConversations(db));
        await persistIndex(index, db);
      }

      if (result.completed) {
        await setLocal('syncSummary', {
          lastCompletedAt: new Date().toISOString(),
          lastResult: result,
        } satisfies SyncSummary);
      }

      return result;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Conversations whose messages are actually stored, for honest progress copy. */
export async function countIndexedConversations(): Promise<number> {
  try {
    return await db.conversations.filter((row) => row.indexedAt !== null).count();
  } catch {
    return 0;
  }
}
