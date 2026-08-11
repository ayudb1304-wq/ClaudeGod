import type { ExtensionMessage, SyncStateReply } from '@/shared/messages';
import { CLAUDE_TAB_PATTERN, isClaudeUrl } from '@/api/claudeAdapter';

/**
 * Popup-side client for the content script's sync bridge.
 *
 * Uses `chrome.tabs.sendMessage` against the active tab. This needs no `tabs`
 * permission: host access to https://claude.ai/* is enough to see that tab's
 * URL and message it. Permissions stay frozen (CLAUDE.md rule 5).
 */

export type SyncClientError = 'no-claude-tab' | 'no-content-script';

export class SyncClientFailure extends Error {
  constructor(readonly reason: SyncClientError) {
    super(reason);
    this.name = 'SyncClientFailure';
  }
}

async function findClaudeTab(): Promise<chrome.tabs.Tab> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (isClaudeUrl(active?.url) && active?.id !== undefined) return active;

  // Fall back to any claude.ai tab: a user who opened the popup from another
  // tab still expects their existing Claude tab to do the work.
  const all = await chrome.tabs.query({ url: CLAUDE_TAB_PATTERN });
  const usable = all.find((tab) => tab.id !== undefined);
  if (!usable) throw new SyncClientFailure('no-claude-tab');
  return usable;
}

async function send(message: ExtensionMessage): Promise<SyncStateReply> {
  const tab = await findClaudeTab();
  try {
    return await chrome.tabs.sendMessage<ExtensionMessage, SyncStateReply>(tab.id ?? -1, message);
  } catch {
    // The tab exists but has no listener: usually the page loaded before the
    // extension was installed or reloaded, so it just needs a refresh.
    throw new SyncClientFailure('no-content-script');
  }
}

export function requestSyncState(): Promise<SyncStateReply> {
  return send({ type: 'GET_SYNC_STATE' });
}

export function requestStartSync(): Promise<SyncStateReply> {
  return send({ type: 'START_SYNC' });
}
