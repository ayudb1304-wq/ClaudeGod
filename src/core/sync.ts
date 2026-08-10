import { z } from 'zod';
import type { ConversationDetail, ConversationSummary, Organization } from '@/api/types';
import type { ArtifactRecord, ConversationRecord, MessageRecord, SyncStore } from './db';
import { extractArtifacts } from './artifacts';
import { setDegraded, setIdle, setSyncing } from '@/shared/syncStatus';

/**
 * Backfill + incremental sync (ARCHITECTURE §3, FEATURES 1.1).
 *
 * Shape of the run: page the conversation list, fetch each conversation's
 * detail, persist, checkpoint. Resumable across tab close because the
 * checkpoint is written after every conversation, not at the end of a page.
 */

const PAGE_SIZE = 50;

/** The adapter surface sync needs. Injected so tests need no network. */
export interface SyncAdapter {
  getChatOrganization(): Promise<Organization | null>;
  listConversations(orgId: string, limit: number, offset: number): Promise<ConversationSummary[]>;
  getConversation(orgId: string, uuid: string): Promise<ConversationDetail | null>;
}

export interface SyncDeps {
  adapter: SyncAdapter;
  store: SyncStore;
  /** Abort cooperatively; the run stops at the next conversation boundary. */
  signal?: AbortSignal;
}

export interface SyncResult {
  indexed: number;
  skipped: number;
  failed: number;
  completed: boolean;
}

const CheckpointSchema = z.object({
  orgId: z.string(),
  offset: z.number(),
  indexed: z.number(),
  /** Conversations seen in the list phase but not yet detail-fetched. */
  pending: z.array(z.string()),
});

type Checkpoint = z.infer<typeof CheckpointSchema>;

async function loadCheckpoint(store: SyncStore): Promise<Checkpoint | null> {
  const raw = await store.getCheckpoint();
  const parsed = CheckpointSchema.safeParse(raw);
  // A checkpoint we cannot read is worse than none: start clean rather than
  // resume from a half-understood position.
  return parsed.success ? parsed.data : null;
}

function toConversationRecord(
  summary: ConversationSummary,
  indexedAt: string | null,
): ConversationRecord {
  return {
    uuid: summary.uuid,
    title: summary.name ?? '',
    updatedAt: summary.updated_at ?? '',
    createdAt: summary.created_at ?? null,
    isStarred: summary.is_starred ?? false,
    projectUuid: summary.project_uuid ?? null,
    indexedAt,
  };
}

/**
 * Flattens a conversation's messages into rows.
 *
 * Prefers the message's own `text` (already flattened by the API) and falls back
 * to concatenating `text` blocks. `thinking`, `tool_use` and `tool_result`
 * blocks are deliberately excluded: extended thinking is noise in search results
 * and users do not expect it in exports. See docs/api-notes.md §3.
 */
function toMessageRecords(detail: ConversationDetail): MessageRecord[] {
  const messages = detail.chat_messages ?? [];
  const records: MessageRecord[] = [];

  messages.forEach((message, position) => {
    const blocks = message.content ?? [];
    const fallbackText = blocks
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text ?? '')
      .join('\n\n');

    records.push({
      convUuid: detail.uuid,
      // `index` is optional upstream; array position is the stable fallback and
      // keeps the [convUuid+index] primary key unique.
      index: message.index ?? position,
      uuid: message.uuid,
      sender: message.sender ?? 'unknown',
      text: message.text ?? fallbackText,
      createdAt: message.created_at ?? null,
      hasArtifact: blocks.some((block) => block.type === 'tool_use' && block.name === 'artifacts'),
      truncated: message.truncated ?? false,
    });
  });

  return records;
}

function toArtifactRecords(detail: ConversationDetail): ArtifactRecord[] {
  return extractArtifacts(detail.uuid, detail.chat_messages ?? []);
}

/**
 * Persists one conversation. Returns false when the detail could not be read,
 * so the caller can count it as failed without aborting the whole run.
 */
async function syncOne(
  deps: SyncDeps,
  orgId: string,
  summary: ConversationSummary,
): Promise<boolean> {
  const detail = await deps.adapter.getConversation(orgId, summary.uuid);
  if (!detail) return false;

  await deps.store.replaceMessages(summary.uuid, toMessageRecords(detail));
  await deps.store.replaceArtifacts(summary.uuid, toArtifactRecords(detail));
  await deps.store.putConversation(toConversationRecord(summary, new Date().toISOString()));
  return true;
}

/**
 * Full backfill, resumable.
 *
 * Incremental behaviour falls out of the same loop: conversations whose
 * `updated_at` matches what we already stored are skipped, so a second run over
 * an indexed account touches only what changed (FEATURES 1.1).
 */
export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const result: SyncResult = { indexed: 0, skipped: 0, failed: 0, completed: false };

  let org: Organization | null;
  try {
    org = await deps.adapter.getChatOrganization();
  } catch (error) {
    setDegraded(error instanceof Error ? error.message : 'Could not reach claude.ai');
    return result;
  }

  if (!org) {
    setDegraded('No organization with chat capability');
    return result;
  }

  const orgId = org.uuid;
  const checkpoint = await loadCheckpoint(deps.store);
  const resuming = checkpoint?.orgId === orgId;

  let offset = resuming ? checkpoint.offset : 0;
  result.indexed = resuming ? checkpoint.indexed : 0;

  const known = await deps.store.getIndexedConversations();
  setSyncing({ indexed: result.indexed, total: null });

  try {
    // Outer loop pages the list; inner loop drains each page one conversation
    // at a time so an abort mid-page still leaves a usable checkpoint.
    for (;;) {
      if (deps.signal?.aborted) return result;

      const page = await deps.adapter.listConversations(orgId, PAGE_SIZE, offset);
      // Offset past the end returns 200 with []. That is the terminator.
      if (page.length === 0) break;

      for (const summary of page) {
        if (deps.signal?.aborted) return result;

        const previous = known.get(summary.uuid);
        if (previous && summary.updated_at && previous === summary.updated_at) {
          result.skipped++;
          continue;
        }

        try {
          const ok = await syncOne(deps, orgId, summary);
          if (ok) result.indexed++;
          else result.failed++;
        } catch {
          // One unreadable conversation must not end the backfill. The adapter
          // has already counted the failure toward its degraded threshold.
          result.failed++;
        }

        setSyncing({ indexed: result.indexed, total: null });
        await deps.store.setCheckpoint({
          orgId,
          offset,
          indexed: result.indexed,
          pending: page.map((item) => item.uuid),
        } satisfies Checkpoint);
      }

      offset += page.length;
    }

    result.completed = true;
    await deps.store.clearCheckpoint();
    setIdle();
    return result;
  } catch (error) {
    // Adapter gave up (retries exhausted or failure limit hit). Keep the
    // checkpoint so the next run resumes instead of restarting.
    setDegraded(error instanceof Error ? error.message : 'Sync failed');
    return result;
  }
}
