import { z } from 'zod';
import type { Message } from '@/api/types';

/**
 * Artifact extraction.
 *
 * Artifacts are NOT a top-level API entity (docs/api-notes.md §4). They arrive
 * as `tool_use` content blocks named "artifacts", and a single artifact can span
 * several blocks across a conversation as the user asks for edits.
 */

const ARTIFACT_TOOL_NAME = 'artifacts';

const ArtifactInputSchema = z
  .object({
    id: z.string().optional(),
    command: z.string().optional(),
    title: z.string().nullish(),
    type: z.string().nullish(),
    language: z.string().nullish(),
    content: z.string().nullish(),
    version_uuid: z.string().nullish(),
  })
  .loose();

export interface ExtractedArtifact {
  /** Stable within a conversation; comes from input.id. */
  id: string;
  convUuid: string;
  title: string | null;
  type: string | null;
  language: string | null;
  content: string;
  /**
   * True when `update` commands followed the last full snapshot we could read.
   *
   * `create` and `rewrite` carry the whole body in `input.content`, but `update`
   * carries a partial edit (old/new fragments), so replaying it faithfully means
   * reimplementing Claude's diff semantics. We keep the last full snapshot and
   * flag it instead of silently exporting a stale body as if it were current.
   * Surfaced in export as a note; revisit if users report it mattering.
   */
  possiblyStale: boolean;
}

/** Commands that carry a complete artifact body in `input.content`. */
const FULL_SNAPSHOT_COMMANDS = new Set(['create', 'rewrite']);

/**
 * Folds every artifact block in a conversation down to one record per artifact.
 *
 * Without folding, bulk export emits one file per edit (FEATURES 6.2), which is
 * the failure mode the api-notes call out.
 */
export function extractArtifacts(convUuid: string, messages: Message[]): ExtractedArtifact[] {
  const byId = new Map<string, ExtractedArtifact>();

  for (const message of messages) {
    for (const block of message.content ?? []) {
      if (block.type !== 'tool_use' || block.name !== ARTIFACT_TOOL_NAME) continue;

      const parsed = ArtifactInputSchema.safeParse(block.input);
      if (!parsed.success) continue;

      const input = parsed.data;
      const id = input.id;
      if (!id) continue;

      const command = input.command ?? '';
      const hasFullBody = FULL_SNAPSHOT_COMMANDS.has(command) && typeof input.content === 'string';

      const existing = byId.get(id);

      if (hasFullBody) {
        byId.set(id, {
          id,
          convUuid,
          title: input.title ?? existing?.title ?? null,
          type: input.type ?? existing?.type ?? null,
          language: input.language ?? existing?.language ?? null,
          content: input.content ?? '',
          possiblyStale: false,
        });
        continue;
      }

      if (existing) {
        // A partial edit landed after our snapshot. Keep the body, flag it.
        existing.possiblyStale = true;
        if (input.title) existing.title = input.title;
        continue;
      }

      // An update with no preceding snapshot: record what we have so the
      // artifact is not lost entirely, and mark it incomplete.
      byId.set(id, {
        id,
        convUuid,
        title: input.title ?? null,
        type: input.type ?? null,
        language: input.language ?? null,
        content: typeof input.content === 'string' ? input.content : '',
        possiblyStale: true,
      });
    }
  }

  return [...byId.values()];
}
