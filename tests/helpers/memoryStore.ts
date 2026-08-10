import type {
  ArtifactRecord,
  ConversationRecord,
  MessageRecord,
  SyncStore,
} from '@/core/db';

/**
 * In-memory SyncStore for testing the sync state machine.
 *
 * Sync depends on the SyncStore port rather than Dexie, so the resume and
 * incremental tests run without IndexedDB and without a fake-indexeddb
 * dependency. What is under test is the state machine, not Dexie.
 */
export class MemorySyncStore implements SyncStore {
  checkpoint: unknown = null;
  conversations = new Map<string, ConversationRecord>();
  messages = new Map<string, MessageRecord[]>();
  artifacts = new Map<string, ArtifactRecord[]>();

  getCheckpoint(): Promise<unknown> {
    return Promise.resolve(this.checkpoint);
  }

  setCheckpoint(value: unknown): Promise<void> {
    this.checkpoint = value;
    return Promise.resolve();
  }

  clearCheckpoint(): Promise<void> {
    this.checkpoint = null;
    return Promise.resolve();
  }

  getIndexedConversations(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const record of this.conversations.values()) {
      if (record.indexedAt) map.set(record.uuid, record.updatedAt);
    }
    return Promise.resolve(map);
  }

  putConversation(record: ConversationRecord): Promise<void> {
    this.conversations.set(record.uuid, record);
    return Promise.resolve();
  }

  replaceMessages(convUuid: string, records: MessageRecord[]): Promise<void> {
    this.messages.set(convUuid, records);
    return Promise.resolve();
  }

  replaceArtifacts(convUuid: string, records: ArtifactRecord[]): Promise<void> {
    this.artifacts.set(convUuid, records);
    return Promise.resolve();
  }
}
