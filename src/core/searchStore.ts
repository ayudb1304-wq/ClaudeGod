import { db, type ClaudeGodDb } from './db';
import { SearchIndex, applyTierCap, type IndexableConversation } from './searchIndex';

/**
 * Bridges the search index to IndexedDB: loads documents, persists the
 * serialized index, and rebuilds when the serialized copy is unusable.
 *
 * Kept separate from searchIndex.ts so the index itself stays pure and testable
 * without a database.
 */

const SERIALIZED_KEY = 'miniSearchIndex';
const VERSION_KEY = 'miniSearchVersion';

/** Bump to force a rebuild after changing chunking or field configuration. */
const INDEX_VERSION = 1;

export async function loadIndexableConversations(
  database: ClaudeGodDb = db,
  cap: number | null | undefined = undefined,
): Promise<IndexableConversation[]> {
  const conversations = await database.conversations.toArray();

  const indexable: IndexableConversation[] = conversations
    .filter((conversation) => conversation.indexedAt !== null)
    .map((conversation) => ({
      uuid: conversation.uuid,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      messages: [],
    }));

  // Capping before reading messages matters: on a free account this avoids
  // pulling the message rows for hundreds of conversations we will discard.
  const capped = cap === undefined ? applyTierCap(indexable) : applyTierCap(indexable, cap);

  for (const conversation of capped) {
    const messages = await database.messages.where('convUuid').equals(conversation.uuid).toArray();
    conversation.messages = messages
      .filter((message) => message.text.length > 0)
      .map((message) => ({
        index: message.index,
        uuid: message.uuid,
        sender: message.sender,
        text: message.text,
        createdAt: message.createdAt,
      }));
  }

  return capped;
}

async function readSerialized(database: ClaudeGodDb): Promise<string | null> {
  const version = await database.searchMeta.get(VERSION_KEY);
  if (version?.value !== INDEX_VERSION) return null;
  const row = await database.searchMeta.get(SERIALIZED_KEY);
  return typeof row?.value === 'string' ? row.value : null;
}

/**
 * TODO(M5): enforce the free-tier cap on incremental updates.
 *
 * `applyTierCap` bounds the index at build time, but `SearchIndex.upsert` does
 * not know about the cap, so a free user syncing their 101st conversation would
 * grow the index past 100 until the next full rebuild. Not reachable today:
 * sync has no trigger wired yet (FEATURES 7.2 requires opt-in onboarding), so
 * upsert is never called outside tests.
 *
 * Fix where sync calls upsert, not here: that is the only place that knows a
 * conversation was added and can evict the oldest in the same step.
 */
export async function persistIndex(
  index: SearchIndex,
  database: ClaudeGodDb = db,
): Promise<void> {
  await database.searchMeta.put({ key: SERIALIZED_KEY, value: index.serialize() });
  await database.searchMeta.put({ key: VERSION_KEY, value: INDEX_VERSION });
}

/**
 * Restores the persisted index, falling back to a full rebuild.
 *
 * ARCHITECTURE §4: rebuild from Dexie if deserialization fails. A corrupt or
 * stale serialized index is a recoverable condition, never a broken feature.
 */
export async function loadOrBuildIndex(database: ClaudeGodDb = db): Promise<SearchIndex> {
  const index = new SearchIndex();

  const serialized = await readSerialized(database);
  if (serialized && index.restore(serialized) && index.documentCount > 0) {
    return index;
  }

  index.build(await loadIndexableConversations(database));
  await persistIndex(index, database);
  return index;
}
