import type {
  DeleteReply,
  ExportReply,
  ExtensionMessage,
  SyncStateReply,
  TitlesReply,
} from '@/shared/messages';
import { CLAUDE_HOME_URL, CLAUDE_TAB_PATTERN, isClaudeUrl } from '@/api/claudeAdapter';

/**
 * Popup/options-side client for the content script's sync bridge.
 *
 * Uses `chrome.tabs.sendMessage` against a claude.ai tab. This needs no `tabs`
 * permission: host access to https://claude.ai/* is enough to see that tab's
 * URL and message it, and `tabs.create` needs no permission at all. The frozen
 * permission set (CLAUDE.md rule 5) stands.
 */

export type SyncClientError = 'no-claude-tab' | 'no-content-script';

export class SyncClientFailure extends Error {
  constructor(readonly reason: SyncClientError) {
    super(reason);
    this.name = 'SyncClientFailure';
  }
}

/** Result of resolving a usable tab, so callers can explain what happened. */
export interface BridgeTarget {
  tabId: number;
  /** True when we had to open a tab because none was usable. */
  opened: boolean;
}

const READY_TIMEOUT_MS = 12_000;
const POLL_INTERVAL_MS = 400;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Returns the reply, or null when no content script is listening. */
async function ping(tabId: number): Promise<SyncStateReply | null> {
  try {
    return await chrome.tabs.sendMessage<ExtensionMessage, SyncStateReply>(tabId, {
      type: 'GET_SYNC_STATE',
    });
  } catch {
    return null;
  }
}

async function waitForBridge(tabId: number): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    if (await ping(tabId)) return true;
    if (Date.now() > deadline) return false;
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Finds a claude.ai tab whose content script is actually listening, opening one
 * if necessary.
 *
 * Deliberately never reloads an existing tab. A tab that predates the extension
 * has a dead content script and reloading would fix it, but it would also throw
 * away anything half-typed in Claude's composer. Opening a background tab costs
 * the user nothing and cannot lose their work.
 */
export async function resolveBridge(): Promise<BridgeTarget> {
  const tabs = await chrome.tabs.query({ url: CLAUDE_TAB_PATTERN });

  // Prefer the active tab if it is Claude, so sync runs where the user is.
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const ordered =
    isClaudeUrl(active?.url) && active?.id !== undefined
      ? [active, ...tabs.filter((tab) => tab.id !== active.id)]
      : tabs;

  for (const tab of ordered) {
    if (tab.id !== undefined && (await ping(tab.id))) return { tabId: tab.id, opened: false };
  }

  // Nothing responded: either no Claude tab, or every one predates the
  // extension. Both are fixed by a fresh tab.
  const created = await chrome.tabs.create({ url: CLAUDE_HOME_URL, active: false });
  if (created.id !== undefined && (await waitForBridge(created.id))) {
    return { tabId: created.id, opened: true };
  }

  throw new SyncClientFailure('no-content-script');
}

async function send<Reply>(message: ExtensionMessage): Promise<Reply> {
  const { tabId } = await resolveBridge();
  try {
    return await chrome.tabs.sendMessage<ExtensionMessage, Reply>(tabId, message);
  } catch {
    throw new SyncClientFailure('no-content-script');
  }
}

/** Like `send`, but never opens a tab. For reads that run without being asked. */
async function query<Reply>(message: ExtensionMessage): Promise<Reply> {
  const tabs = await chrome.tabs.query({ url: CLAUDE_TAB_PATTERN });
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    try {
      return await chrome.tabs.sendMessage<ExtensionMessage, Reply>(tab.id, message);
    } catch {
      // Tab predates the extension, so nothing is listening. Try the next.
    }
  }
  throw new SyncClientFailure(tabs.length === 0 ? 'no-claude-tab' : 'no-content-script');
}

/**
 * Read-only status probe. Unlike a start request this must not open tabs: the
 * popup polls it, and a poll that spawns tabs would be a menace.
 */
export async function requestSyncState(): Promise<SyncStateReply> {
  const tabs = await chrome.tabs.query({ url: CLAUDE_TAB_PATTERN });
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    const reply = await ping(tab.id);
    if (reply) return reply;
  }
  throw new SyncClientFailure(tabs.length === 0 ? 'no-claude-tab' : 'no-content-script');
}

export function requestStartSync(): Promise<SyncStateReply> {
  return send<SyncStateReply>({ type: 'START_SYNC' });
}

/**
 * Titles for folder contents. Read-only, so it never opens a tab: with no
 * Claude tab open the caller simply shows ids-only rows.
 */
export async function requestConversationTitles(
  convIds: string[],
): Promise<Map<string, string>> {
  if (convIds.length === 0) return new Map();
  const reply = await query<TitlesReply>({ type: 'GET_CONVERSATION_TITLES', convIds });
  return new Map(reply.titles);
}

/** Explicit user action, so opening a tab to serve it is fair. */
export function requestExportAll(): Promise<ExportReply> {
  return send<ExportReply>({ type: 'EXPORT_ALL' });
}

export function requestDeleteLocalData(): Promise<DeleteReply> {
  return send<DeleteReply>({ type: 'DELETE_LOCAL_DATA' });
}
