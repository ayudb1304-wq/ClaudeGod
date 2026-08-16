import {
  isExtensionMessage,
  type DeleteReply,
  type ExportReply,
  type ExtensionMessage,
  type SyncStateReply,
  type TitlesReply,
} from '@/shared/messages';
import { getSyncStatus } from '@/shared/syncStatus';
import {
  countIndexedConversations,
  deleteAllLocalData,
  isSyncRunning,
  readSyncSummary,
  startSync,
} from '@/core/syncRunner';
import { getConversationTitles } from '@/core/db';
import { createDexieExportSource, exportConversationsZip } from '@/core/exporter';
import { downloadFile } from '@/shared/download';

/**
 * Serves the popup and options page (FEATURES 4.1, 6.2, 7.2, 8.1).
 *
 * Those pages cannot do this work themselves for two reasons: claude.ai cookies
 * belong to this context, and — less obvious, and the source of three real bugs
 * — so does the conversation mirror. A content script shares the *page's*
 * storage origin, so the IndexedDB holding conversations lives under
 * https://claude.ai. An extension page opening the same database name gets an
 * empty one (api-notes §7). So they ask, and this answers.
 *
 * START_SYNC and DELETE_LOCAL_DATA only ever arrive because the user pressed a
 * button. Nothing here acts on its own, which is the consent guarantee in
 * FEATURES 7.2.
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

/**
 * Builds and saves the ZIP here rather than handing bytes back to the popup:
 * the popup closes the moment focus moves, which would abort the download.
 */
async function exportAll(): Promise<ExportReply> {
  try {
    const convIds = await createDexieExportSource().listConversationUuids();
    if (convIds.length === 0) {
      return { outcome: 'empty', conversations: 0, filename: null };
    }
    const file = await exportConversationsZip(convIds);
    downloadFile(file);
    return { outcome: 'downloaded', conversations: convIds.length, filename: file.filename };
  } catch {
    return { outcome: 'failed', conversations: 0, filename: null };
  }
}

type BridgeReply = SyncStateReply | TitlesReply | ExportReply | DeleteReply;

async function handle(message: ExtensionMessage): Promise<BridgeReply> {
  switch (message.type) {
    case 'START_SYNC':
      // Deliberately not awaited: a backfill runs for minutes and the popup
      // closes long before it ends. Progress is polled, not awaited.
      void startSync();
      return buildReply();
    case 'GET_SYNC_STATE':
      return buildReply();
    case 'GET_CONVERSATION_TITLES':
      return { titles: [...(await getConversationTitles(message.convIds))] };
    case 'EXPORT_ALL':
      return exportAll();
    case 'DELETE_LOCAL_DATA':
      // Runs here so the wipe reaches the real mirror. The settings page doing
      // this itself would clear an empty database and report success.
      await deleteAllLocalData();
      return { deleted: true };
  }
}

export function mountSyncBridge(): () => void {
  const listener = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (reply: BridgeReply) => void,
  ): boolean => {
    if (!isExtensionMessage(message)) return false;

    void handle(message).then(sendResponse);
    // Keeps the message channel open for the async reply.
    return true;
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => {
    chrome.runtime.onMessage.removeListener(listener);
  };
}
