import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runSync, type SyncAdapter } from '@/core/sync';
import { getSyncStatus, resetSyncStatusForTests } from '@/shared/syncStatus';
import { MemorySyncStore } from './helpers/memoryStore';

/**
 * Sync state machine tests (TASKS M1): happy path, malformed conversation,
 * failure storm, resume-from-checkpoint, incremental skip.
 *
 * Fixtures use the shapes recorded in docs/api-notes.md, including the two that
 * diverge from ARCHITECTURE: `chat_messages` and human/assistant senders.
 */

const ORG = { uuid: 'org-1', capabilities: ['chat'] };

function summary(uuid: string, updatedAt = '2026-08-01T10:00:00.000000Z') {
  return { uuid, name: `Chat ${uuid}`, updated_at: updatedAt };
}

function detail(uuid: string, messageCount = 2) {
  return {
    uuid,
    name: `Chat ${uuid}`,
    chat_messages: Array.from({ length: messageCount }, (_, i) => ({
      uuid: `${uuid}-m${String(i)}`,
      index: i,
      sender: i % 2 === 0 ? 'human' : 'assistant',
      text: `message ${String(i)} of ${uuid}`,
      created_at: '2026-08-01T10:00:00.000000Z',
      content: [{ type: 'text', text: `message ${String(i)} of ${uuid}` }],
    })),
  };
}

/** Adapter stub that pages a fixed conversation list. */
function makeAdapter(
  uuids: string[],
  overrides: Partial<SyncAdapter> = {},
  updatedAt?: string,
): SyncAdapter {
  return {
    getChatOrganization: () => Promise.resolve(ORG),
    listConversations: (_org, limit, offset) =>
      Promise.resolve(uuids.slice(offset, offset + limit).map((u) => summary(u, updatedAt))),
    getConversation: (_org, uuid) => Promise.resolve(detail(uuid)),
    ...overrides,
  };
}

beforeEach(() => {
  resetSyncStatusForTests();
});

describe('runSync', () => {
  it('backfills every conversation and clears the checkpoint', async () => {
    const store = new MemorySyncStore();
    const result = await runSync({ adapter: makeAdapter(['a', 'b', 'c']), store });

    expect(result).toMatchObject({ indexed: 3, failed: 0, completed: true });
    expect(store.conversations.size).toBe(3);
    expect(store.messages.get('a')).toHaveLength(2);
    expect(store.checkpoint).toBeNull();
    expect(getSyncStatus().kind).toBe('idle');
  });

  it('maps human/assistant senders and chat_messages, not messages', async () => {
    const store = new MemorySyncStore();
    await runSync({ adapter: makeAdapter(['a']), store });

    const rows = store.messages.get('a') ?? [];
    expect(rows.map((r) => r.sender)).toEqual(['human', 'assistant']);
    expect(rows[0]?.text).toContain('message 0');
  });

  it('counts a malformed conversation as failed without ending the run', async () => {
    const store = new MemorySyncStore();
    const adapter = makeAdapter(['a', 'bad', 'c'], {
      // A detail response that failed lenient parsing arrives as null.
      getConversation: (_org, uuid) =>
        Promise.resolve(uuid === 'bad' ? null : detail(uuid)),
    });

    const result = await runSync({ adapter, store });

    expect(result.indexed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.completed).toBe(true);
    expect(store.conversations.has('c')).toBe(true);
  });

  it('survives a conversation whose detail fetch throws', async () => {
    const store = new MemorySyncStore();
    const adapter = makeAdapter(['a', 'boom', 'c'], {
      getConversation: (_org, uuid) =>
        uuid === 'boom' ? Promise.reject(new Error('429 storm')) : Promise.resolve(detail(uuid)),
    });

    const result = await runSync({ adapter, store });

    expect(result.indexed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.completed).toBe(true);
  });

  it('degrades, keeps the checkpoint, and does not throw when listing fails', async () => {
    const store = new MemorySyncStore();
    const adapter = makeAdapter(['a'], {
      listConversations: () => Promise.reject(new Error('claude.ai returned 500')),
    });

    const result = await runSync({ adapter, store });

    expect(result.completed).toBe(false);
    expect(getSyncStatus().kind).toBe('degraded');
    expect(getSyncStatus().degradedReason).toContain('500');
  });

  it('resumes from a checkpoint instead of restarting', async () => {
    const store = new MemorySyncStore();
    // 60 conversations means two pages; pretend page one already completed.
    const uuids = Array.from({ length: 60 }, (_, i) => `c${String(i)}`);
    store.checkpoint = { orgId: 'org-1', offset: 50, indexed: 50, pending: [] };

    const listSpy = vi.fn((_org: string, limit: number, offset: number) =>
      Promise.resolve(uuids.slice(offset, offset + limit).map((u) => summary(u))),
    );
    const result = await runSync({
      adapter: makeAdapter(uuids, { listConversations: listSpy }),
      store,
    });

    // Resumed at 50, so only the final 10 were fetched, and the count continues.
    expect(store.conversations.size).toBe(10);
    expect(result.indexed).toBe(60);
    expect(listSpy.mock.calls[0]?.[2]).toBe(50);
  });

  it('ignores an unreadable checkpoint and starts clean', async () => {
    const store = new MemorySyncStore();
    store.checkpoint = { totally: 'wrong shape' };

    const result = await runSync({ adapter: makeAdapter(['a', 'b']), store });

    expect(result.indexed).toBe(2);
    expect(result.completed).toBe(true);
  });

  it('skips conversations whose updated_at is unchanged', async () => {
    const store = new MemorySyncStore();
    const stamp = '2026-08-01T10:00:00.000000Z';

    await runSync({ adapter: makeAdapter(['a', 'b'], {}, stamp), store });

    const detailSpy = vi.fn((_org: string, uuid: string) => Promise.resolve(detail(uuid)));
    const second = await runSync({
      adapter: makeAdapter(['a', 'b'], { getConversation: detailSpy }, stamp),
      store,
    });

    expect(second.skipped).toBe(2);
    expect(second.indexed).toBe(0);
    expect(detailSpy).not.toHaveBeenCalled();
  });

  it('re-syncs a conversation whose updated_at moved', async () => {
    const store = new MemorySyncStore();
    await runSync({ adapter: makeAdapter(['a'], {}, '2026-08-01T10:00:00.000000Z'), store });

    const second = await runSync({
      adapter: makeAdapter(['a'], {}, '2026-08-09T12:00:00.000000Z'),
      store,
    });

    expect(second.indexed).toBe(1);
    expect(second.skipped).toBe(0);
  });

  it('stops cooperatively when aborted, leaving a resumable checkpoint', async () => {
    const store = new MemorySyncStore();
    const controller = new AbortController();

    const adapter = makeAdapter(['a', 'b', 'c'], {
      getConversation: (_org, uuid) => {
        if (uuid === 'b') controller.abort();
        return Promise.resolve(detail(uuid));
      },
    });

    const result = await runSync({ adapter, store, signal: controller.signal });

    expect(result.completed).toBe(false);
    expect(store.checkpoint).not.toBeNull();
    expect(store.conversations.size).toBeLessThan(3);
  });
});
