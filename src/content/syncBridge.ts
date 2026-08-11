import { isExtensionMessage, type SyncStateReply } from '@/shared/messages';
import { getSyncStatus } from '@/shared/syncStatus';
import {
  countIndexedConversations,
  isSyncRunning,
  readSyncSummary,
  startSync,
} from '@/core/syncRunner';

/**
 * Serves indexing commands from the popup (FEATURES 7.2, 8.1).
 *
 * The popup cannot run sync itself: claude.ai cookies belong to this context.
 * So the popup asks, and this answers.
 *
 * START_SYNC only ever arrives because the user pressed a button. Nothing here
 * starts indexing on its own, which is the consent guarantee in FEATURES 7.2.
 */

async function buildReply(): Promise<SyncStateReply> {
  const summary = await readSyncSummary();
  return {
    status: getSyncStatus(),
    running: isSyncRunning(),
    indexedConversations: await countIndexedConversations(),
    lastCompletedAt: summary.lastCompletedAt,
  };
}

export function mountSyncBridge(): () => void {
  const listener = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (reply: SyncStateReply) => void,
  ): boolean => {
    if (!isExtensionMessage(message)) return false;

    if (message.type === 'START_SYNC') {
      // Deliberately not awaited: a backfill runs for minutes and the popup
      // closes long before it ends. Progress is polled, not awaited.
      void startSync();
    }

    void buildReply().then(sendResponse);
    // Keeps the message channel open for the async reply.
    return true;
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => {
    chrome.runtime.onMessage.removeListener(listener);
  };
}
