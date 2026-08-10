/**
 * Drag payloads for "drop a chat into a folder" (FEATURES 4.1).
 *
 * Two sources have to work: Claude's own sidebar links, which we do not control
 * and which the browser fills in as URLs, and our search results, which we do.
 * Reading the URL forms is what makes the native sidebar work without touching
 * Claude's DOM or depending on their markup.
 */

export const CONVERSATION_DRAG_TYPE = 'application/x-claudegod-conversation';

/** Conversation uuids appear as `/chat/<uuid>` in every link Claude renders. */
const CHAT_PATH = /\/chat\/([0-9a-zA-Z-]{16,})/;

export function conversationUuidFromUrl(value: string): string | null {
  return CHAT_PATH.exec(value)?.[1] ?? null;
}

/**
 * True when a drag *might* carry a conversation. Only the type list is readable
 * during dragover — the payload itself is withheld until drop — so the hover
 * affordance has to be decided from types alone.
 */
export function looksLikeConversationDrag(types: readonly string[]): boolean {
  return types.some(
    (type) => type === CONVERSATION_DRAG_TYPE || type === 'text/uri-list' || type === 'text/plain',
  );
}

export function readConversationUuid(transfer: DataTransfer | null): string | null {
  if (!transfer) return null;

  const direct = transfer.getData(CONVERSATION_DRAG_TYPE);
  if (direct) return direct;

  for (const type of ['text/uri-list', 'text/plain'] as const) {
    const value = transfer.getData(type);
    // uri-list can hold several lines, comments included; take the first hit.
    const uuid = value ? conversationUuidFromUrl(value) : null;
    if (uuid) return uuid;
  }

  return null;
}

/** Used by our own drag sources (search results) so no URL parsing is needed. */
export function writeConversationDrag(transfer: DataTransfer, convUuid: string): void {
  transfer.effectAllowed = 'copy';
  transfer.setData(CONVERSATION_DRAG_TYPE, convUuid);
  // A plain-text fallback keeps the drag meaningful if it lands anywhere else.
  transfer.setData('text/plain', `${window.location.origin}/chat/${convUuid}`);
}
