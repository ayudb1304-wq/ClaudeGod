import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ClaudeGodDb, createDexieSyncStore } from '@/core/db';
import { loadIndexableConversations, loadOrBuildIndex } from '@/core/searchStore';

/**
 * Repro attempt for the real-browser 0-document index: seed a Dexie DB the way
 * the sync engine does, then run the exact load path the overlay uses.
 */

describe('searchStore against real (fake) IndexedDB', () => {
  it('builds a non-empty index from synced data', async () => {
    const db = new ClaudeGodDb('repro');
    const store = createDexieSyncStore(db);

    for (let i = 0; i < 25; i++) {
      const uuid = `conv-${String(i)}`;
      await store.replaceMessages(uuid, [
        {
          convUuid: uuid,
          index: 0,
          uuid: `msg-${String(i)}-0`,
          sender: 'human',
          text: `hello from conversation ${String(i)} about indie saas ideas`,
          createdAt: '2026-08-01T00:00:00Z',
          hasArtifact: false,
          truncated: false,
        },
        {
          convUuid: uuid,
          index: 1,
          uuid: `msg-${String(i)}-1`,
          sender: 'assistant',
          text: 'a reply with plenty of searchable text in it',
          createdAt: '2026-08-01T00:00:01Z',
          hasArtifact: false,
          truncated: false,
        },
      ]);
      await store.putConversation({
        uuid,
        title: `Conversation ${String(i)}`,
        updatedAt: `2026-08-0${String((i % 9) + 1)}T12:00:00Z`,
        createdAt: null,
        isStarred: false,
        projectUuid: null,
        indexedAt: new Date().toISOString(),
      });
    }

    const convs = await loadIndexableConversations(db);
    const totalMessages = convs.reduce((n, c) => n + c.messages.length, 0);
    const index = await loadOrBuildIndex(db);

    expect(convs.length).toBe(25);
    expect(totalMessages).toBe(50);
    expect(index.documentCount).toBeGreaterThan(0);

    const hits = index.search('indie saas');
    expect(hits.length).toBeGreaterThan(0);
    db.close();
  });
});
