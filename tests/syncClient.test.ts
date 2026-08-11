import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncClientFailure, requestStartSync, requestSyncState } from '@/popup/syncClient';

/**
 * Reported: onboarding's "Start indexing" dead-ended on "Reload your claude.ai
 * tab". Accurate but useless, and worst on first run, when a new user has no
 * Claude tab open at all or one that predates the install.
 *
 * Starting now resolves a usable tab itself. Status polling deliberately does
 * not, because the popup polls it and a poll that spawns tabs is a menace.
 */

interface FakeTab {
  id: number;
  url: string;
  active?: boolean;
  /** false models a tab whose content script predates the extension. */
  listening: boolean;
}

function installTabs(tabs: FakeTab[], onCreate?: (tab: FakeTab) => void) {
  const created: { url: string; active: boolean }[] = [];
  let nextId = 900;

  const api = {
    tabs: {
      query: (info: { url?: string; active?: boolean }) => {
        if (info.active) return Promise.resolve(tabs.filter((tab) => tab.active));
        if (info.url) return Promise.resolve(tabs.filter((tab) => tab.url.startsWith('https://claude.ai/')));
        return Promise.resolve(tabs);
      },
      create: (info: { url: string; active: boolean }) => {
        created.push(info);
        const tab: FakeTab = { id: nextId++, url: info.url, listening: false };
        tabs.push(tab);
        onCreate?.(tab);
        return Promise.resolve(tab);
      },
      sendMessage: (tabId: number, message: { type: string }) => {
        const tab = tabs.find((candidate) => candidate.id === tabId);
        if (!tab?.listening) return Promise.reject(new Error('no receiving end'));
        return Promise.resolve({
          status: { kind: 'idle', progress: null, degradedReason: null },
          running: message.type === 'START_SYNC',
          indexedConversations: 7,
          lastCompletedAt: null,
        });
      },
    },
  };

  vi.stubGlobal('chrome', api);
  return { created };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('requestStartSync', () => {
  it('uses a live Claude tab when one exists', async () => {
    const { created } = installTabs([
      { id: 1, url: 'https://claude.ai/chats', listening: true },
    ]);

    await expect(requestStartSync()).resolves.toMatchObject({ running: true });
    expect(created).toHaveLength(0);
  });

  it('prefers the active Claude tab so sync runs where the user is', async () => {
    installTabs([
      { id: 1, url: 'https://claude.ai/chats', listening: true },
      { id: 2, url: 'https://claude.ai/chat/abc', active: true, listening: true },
    ]);

    const sendMessage = vi.spyOn(chrome.tabs, 'sendMessage');
    await requestStartSync();

    expect(sendMessage.mock.calls.some((call) => call[0] === 2)).toBe(true);
  });

  it('opens a background tab when no Claude tab is open', async () => {
    // The first-run case: brand new install, nothing open.
    const { created } = installTabs([], (tab) => {
      tab.listening = true;
    });

    await expect(requestStartSync()).resolves.toMatchObject({ running: true });
    expect(created).toEqual([{ url: 'https://claude.ai/chats', active: false }]);
  });

  it('opens a fresh tab rather than reloading a stale one', async () => {
    // A tab predating the extension has a dead content script. Reloading would
    // fix it and discard anything half-typed in Claude's composer.
    const tabs: FakeTab[] = [{ id: 1, url: 'https://claude.ai/chats', listening: false }];
    const { created } = installTabs(tabs, (tab) => {
      tab.listening = true;
    });

    await expect(requestStartSync()).resolves.toMatchObject({ running: true });
    expect(created).toHaveLength(1);
    // The user's tab is untouched.
    expect(tabs[0]?.listening).toBe(false);
  });
});

describe('requestSyncState', () => {
  it('never opens a tab, because the popup polls it', async () => {
    const { created } = installTabs([]);

    await expect(requestSyncState()).rejects.toBeInstanceOf(SyncClientFailure);
    expect(created).toHaveLength(0);
  });

  it('reports no-claude-tab when nothing is open', async () => {
    installTabs([]);
    await expect(requestSyncState()).rejects.toMatchObject({ reason: 'no-claude-tab' });
  });

  it('reports no-content-script when a tab exists but is not listening', async () => {
    installTabs([{ id: 1, url: 'https://claude.ai/chats', listening: false }]);
    await expect(requestSyncState()).rejects.toMatchObject({ reason: 'no-content-script' });
  });

  it('returns state from a listening tab', async () => {
    installTabs([{ id: 1, url: 'https://claude.ai/chats', listening: true }]);
    await expect(requestSyncState()).resolves.toMatchObject({ indexedConversations: 7 });
  });
});
