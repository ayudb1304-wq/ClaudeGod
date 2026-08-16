/**
 * Typed cross-context message schema (ARCHITECTURE §2).
 *
 * Only one direction exists: popup/options → content script. Two separate
 * reasons force it, and both are absolute:
 *
 * 1. **Session.** claude.ai cookies belong to the content script's context. The
 *    popup has none and never fetches claude.ai itself.
 * 2. **Storage origin.** A content script runs in an isolated JS world but
 *    shares the *page's* storage origin, so the conversation mirror lives in
 *    IndexedDB under https://claude.ai — NOT under the extension. Extension
 *    pages opening `claudegod` get a different, empty database. Anything that
 *    reads or deletes the mirror has to ask the content script (api-notes §7).
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

/** Folders store ids only; titles live in the mirror the content script owns. */
export interface GetConversationTitlesMessage {
  type: 'GET_CONVERSATION_TITLES';
  convIds: string[];
}

export interface ExportAllMessage {
  type: 'EXPORT_ALL';
}

export interface DeleteLocalDataMessage {
  type: 'DELETE_LOCAL_DATA';
}

export type ExtensionMessage =
  | StartSyncMessage
  | GetSyncStateMessage
  | GetConversationTitlesMessage
  | ExportAllMessage
  | DeleteLocalDataMessage;

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

/** Reply to GET_CONVERSATION_TITLES. Entries, because a Map is not cloneable. */
export interface TitlesReply {
  titles: [string, string][];
}

export interface ExportReply {
  /** `empty` means nothing is mirrored yet — an honest answer, not a failure. */
  outcome: 'downloaded' | 'empty' | 'failed';
  conversations: number;
  filename: string | null;
}

export interface DeleteReply {
  deleted: boolean;
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  const { type } = value;

  if (type === 'GET_CONVERSATION_TITLES') {
    const ids = (value as { convIds?: unknown }).convIds;
    return Array.isArray(ids) && ids.every((id) => typeof id === 'string');
  }

  return (
    type === 'START_SYNC' ||
    type === 'GET_SYNC_STATE' ||
    type === 'EXPORT_ALL' ||
    type === 'DELETE_LOCAL_DATA'
  );
}
