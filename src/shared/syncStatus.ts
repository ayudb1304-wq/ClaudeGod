/**
 * Global sync status, shared by the adapter (writer) and the UI (readers).
 *
 * Module-level store with a subscribe pattern, per CLAUDE.md: no global state
 * library for something this small.
 */

export type SyncStatusKind = 'idle' | 'syncing' | 'degraded';

export interface SyncStatusState {
  kind: SyncStatusKind;
  /** Backfill progress. Null when not backfilling or when the total is unknown. */
  progress: { indexed: number; total: number | null } | null;
  /**
   * Why we degraded, for the local debug log only. ARCHITECTURE §3 rule 4:
   * record the failing shape locally, never transmit it.
   */
  degradedReason: string | null;
}

const initialState: SyncStatusState = { kind: 'idle', progress: null, degradedReason: null };

let state: SyncStatusState = initialState;
const listeners = new Set<(state: SyncStatusState) => void>();

export function getSyncStatus(): SyncStatusState {
  return state;
}

export function subscribeSyncStatus(listener: (state: SyncStatusState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function emit(next: SyncStatusState): void {
  state = next;
  for (const listener of listeners) {
    // One bad subscriber must not stop the others, and must never reach the adapter.
    try {
      listener(state);
    } catch {
      /* UI listeners are best-effort */
    }
  }
}

export function setSyncing(progress: SyncStatusState['progress'] = null): void {
  emit({ kind: 'syncing', progress, degradedReason: null });
}

export function setIdle(): void {
  emit({ ...initialState });
}

/** Terminal for this run. Search over already-indexed data keeps working. */
export function setDegraded(reason: string): void {
  emit({ kind: 'degraded', progress: state.progress, degradedReason: reason });
}

/** Test-only reset; module state would otherwise leak between test cases. */
export function resetSyncStatusForTests(): void {
  state = initialState;
  listeners.clear();
}
