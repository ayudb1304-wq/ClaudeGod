/**
 * Typed cross-context message schema (ARCHITECTURE §2).
 *
 * Only one direction exists today: popup → content script. Sync has to run in
 * the content script because that is the context holding the user's claude.ai
 * session; the popup has no cookies for it and never fetches claude.ai itself.
 *
 * Kept deliberately small. Every message here is a command the user explicitly
 * asked for, never a background trigger.
 */

import type { SyncStatusState } from './syncStatus';

export interface StartSyncMessage {
  type: 'START_SYNC';
}

export interface GetSyncStateMessage {
  type: 'GET_SYNC_STATE';
}

export type ExtensionMessage = StartSyncMessage | GetSyncStateMessage;

/** What the content script reports back about indexing. */
export interface SyncStateReply {
  status: SyncStatusState;
  /** True while a run is in flight, so the popup can disable its button. */
  running: boolean;
  /** Conversations with messages persisted locally. */
  indexedConversations: number;
  /** ISO timestamp of the last completed run, or null if never. */
  lastCompletedAt: string | null;
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  const { type } = value;
  return type === 'START_SYNC' || type === 'GET_SYNC_STATE';
}
