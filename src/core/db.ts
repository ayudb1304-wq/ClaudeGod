import Dexie, { type EntityTable } from 'dexie';

/**
 * IndexedDB schema v1 (ARCHITECTURE §4).
 *
 * CLAUDE.md hard rule 4: this is the ONLY home for message and artifact text.
 * Nothing in here may be copied into any chrome.storage area. The
 * storage-content guard test enforces that from the other direction.
 */

export interface ConversationRecord {
  uuid: string;
  title: string;
  /** ISO string from the API, kept verbatim for incremental comparison. */
  updatedAt: string;
  createdAt: string | null;
  isStarred: boolean;
  projectUuid: string | null;
  /** Set once the detail fetch has persisted this conversation's messages. */
  indexedAt: string | null;
}

export interface MessageRecord {
  convUuid: string;
  index: number;
  uuid: string;
  /** "human" | "assistant" as returned; not normalised, so odd values survive. */
  sender: string;
  text: string;
  createdAt: string | null;
  hasArtifact: boolean;
  truncated: boolean;
}

export interface ArtifactRecord {
  id: string;
  convUuid: string;
  title: string | null;
  type: string | null;
  language: string | null;
  content: string;
  possiblyStale: boolean;
}

export interface SyncStateRecord {
  key: string;
  value: unknown;
}

export interface SearchMetaRecord {
  key: string;
  value: unknown;
}

/**
 * Divergence from ARCHITECTURE §4: artifacts are keyed on [convUuid+id] rather
 * than id alone. Artifact ids come from the model's own tool input and are only
 * observed to be unique within a conversation, so a bare id risks collisions
 * across conversations.
 */
export class ClaudeGodDb extends Dexie {
  conversations!: EntityTable<ConversationRecord, 'uuid'>;
  messages!: EntityTable<MessageRecord, 'uuid'>;
  artifacts!: EntityTable<ArtifactRecord, 'id'>;
  syncState!: EntityTable<SyncStateRecord, 'key'>;
  searchMeta!: EntityTable<SearchMetaRecord, 'key'>;

  constructor(name = 'claudegod') {
    super(name);
    this.version(1).stores({
      conversations: 'uuid, updatedAt, title, indexedAt',
      messages: '[convUuid+index], convUuid, uuid',
      artifacts: '[convUuid+id], convUuid',
      syncState: 'key',
      searchMeta: 'key',
    });
  }
}

export const db = new ClaudeGodDb();

// ---------------------------------------------------------------------------
// Persistence port
// ---------------------------------------------------------------------------

/**
 * The slice of persistence that core/sync.ts needs.
 *
 * Sync depends on this interface rather than on Dexie directly so the state
 * machine can be tested against an in-memory implementation, which keeps the
 * resume tests fast. (fake-indexeddb does exist as a devDep since the M2
 * verification pass, but only tests/searchStore.test.ts uses it — the one
 * module whose Dexie queries have no port to hide behind.)
 */
export interface SyncStore {
  getCheckpoint(): Promise<unknown>;
  setCheckpoint(value: unknown): Promise<void>;
  clearCheckpoint(): Promise<void>;
  /** Existing conversations as uuid -> updatedAt, for incremental comparison. */
  getIndexedConversations(): Promise<Map<string, string>>;
  putConversation(record: ConversationRecord): Promise<void>;
  replaceMessages(convUuid: string, records: MessageRecord[]): Promise<void>;
  replaceArtifacts(convUuid: string, records: ArtifactRecord[]): Promise<void>;
}

const CHECKPOINT_KEY = 'backfillCheckpoint';

export function createDexieSyncStore(database: ClaudeGodDb = db): SyncStore {
  return {
    async getCheckpoint() {
      const row = await database.syncState.get(CHECKPOINT_KEY);
      return row?.value ?? null;
    },
    async setCheckpoint(value) {
      await database.syncState.put({ key: CHECKPOINT_KEY, value });
    },
    async clearCheckpoint() {
      await database.syncState.delete(CHECKPOINT_KEY);
    },
    async getIndexedConversations() {
      const rows = await database.conversations.toArray();
      const map = new Map<string, string>();
      for (const row of rows) {
        // Only fully-indexed conversations count; a partial one must be retried.
        if (row.indexedAt) map.set(row.uuid, row.updatedAt);
      }
      return map;
    },
    async putConversation(record) {
      await database.conversations.put(record);
    },
    async replaceMessages(convUuid, records) {
      // Replace rather than merge: a conversation edited upstream can lose
      // messages, and stale rows would otherwise linger in search results.
      await database.transaction('rw', database.messages, async () => {
        await database.messages.where('convUuid').equals(convUuid).delete();
        if (records.length > 0) await database.messages.bulkPut(records);
      });
    },
    async replaceArtifacts(convUuid, records) {
      await database.transaction('rw', database.artifacts, async () => {
        await database.artifacts.where('convUuid').equals(convUuid).delete();
        if (records.length > 0) await database.artifacts.bulkPut(records);
      });
    },
  };
}
