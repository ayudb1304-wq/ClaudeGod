import { db, type ClaudeGodDb } from './db';
import { SearchIndex, applyTierCap, type IndexableConversation } from './searchIndex';
import { getEntitlements } from './entitlements';

/**
 * Bridges the search index to IndexedDB: loads documents, persists the
 * serialized index, and rebuilds when the serialized copy is unusable.
 *
 * Kept separate from searchIndex.ts so the index itself stays pure and testable
 * without a database.
 */

const SERIALIZED_KEY = 'miniSearchIndex';
const VERSION_KEY = 'miniSearchVersion';
const CAP_KEY = 'miniSearchCap';

/** Bump to force a rebuild after changing chunking or field configuration. */
const INDEX_VERSION = 1;

/** Sentinel for "no cap", since null cannot be distinguished from missing. */
const UNLIMITED = -1;

function capToStored(cap: number | null): number {
  return cap === null ? UNLIMITED : cap;
}

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

/**
 * Returns the persisted index only when it was built for the current tier.
 *
 * Without the cap check, upgrading to Pro restores the serialized free-tier
 * index and the customer keeps searching 100 conversations until something
 * else happens to force a rebuild. Downgrading has the mirror problem: the
 * full index would survive and keep serving results past the cap.
 */
async function readSerialized(database: ClaudeGodDb): Promise<string | null> {
  const version = await database.searchMeta.get(VERSION_KEY);
  if (version?.value !== INDEX_VERSION) return null;

  const storedCap = await database.searchMeta.get(CAP_KEY);
  if (storedCap?.value !== capToStored(getEntitlements().searchConversationCap)) return null;

  const row = await database.searchMeta.get(SERIALIZED_KEY);
  return typeof row?.value === 'string' ? row.value : null;
}

/**
 * Resolved (was a TODO through M2-M4): the free-tier cap is now enforced on
 * every path that reaches the index.
 *
 * `SearchIndex.upsert` still has no cap awareness, but nothing calls it:
 * `syncRunner` does a full rebuild through `loadIndexableConversations`, which
 * applies `applyTierCap` before any message rows are read. Tier changes are
 * handled by the cap stamp above. If incremental upsert is ever wired for
 * performance, the cap has to be enforced at that call site.
 */
export async function persistIndex(
  index: SearchIndex,
  database: ClaudeGodDb = db,
): Promise<void> {
  await database.searchMeta.put({ key: SERIALIZED_KEY, value: index.serialize() });
  await database.searchMeta.put({ key: VERSION_KEY, value: INDEX_VERSION });
  // Records the tier this index was built for, so a later tier change forces
  // a rebuild rather than silently serving a stale cap.
  await database.searchMeta.put({
    key: CAP_KEY,
    value: capToStored(getEntitlements().searchConversationCap),
  });
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
