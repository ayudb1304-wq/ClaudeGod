import { z } from 'zod';

/**
 * Zod schemas for claude.ai responses.
 *
 * Shapes observed 2026-08-10 (docs/api-notes.md). These are internal endpoints
 * with no compatibility contract, so every schema here is deliberately lenient:
 * unknown keys pass through, and anything we do not strictly need is optional.
 * A field Claude renames should cost us one feature, not the whole sync.
 *
 * Only `uuid` is ever required. Losing an identifier means we cannot store the
 * record at all; losing anything else is survivable.
 */

/** ISO 8601 with microseconds, e.g. 2026-08-10T13:55:23.662768Z. Kept as string. */
const IsoDate = z.string();

export const OrganizationSchema = z
  .object({
    uuid: z.string(),
    name: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    rate_limit_tier: z.string().nullish(),
  })
  .loose();

export const ConversationSummarySchema = z
  .object({
    uuid: z.string(),
    name: z.string().optional(),
    summary: z.string().nullish(),
    created_at: IsoDate.optional(),
    updated_at: IsoDate.optional(),
    is_starred: z.boolean().nullish(),
    project_uuid: z.string().nullish(),
    model: z.string().nullish(),
  })
  .loose();

/**
 * A content block. `type` drives everything downstream, so it is the one field
 * worth requiring. Observed types: text, tool_use, tool_result, thinking.
 */
export const ContentBlockSchema = z
  .object({
    type: z.string(),
    text: z.string().nullish(),
    // tool_use blocks only. Artifacts live here; see core/artifacts.ts.
    name: z.string().nullish(),
    input: z.unknown().optional(),
  })
  .loose();

export const MessageSchema = z
  .object({
    uuid: z.string(),
    index: z.number().optional(),
    sender: z.string().optional(),
    text: z.string().optional(),
    content: z.array(ContentBlockSchema).optional(),
    created_at: IsoDate.optional(),
    truncated: z.boolean().nullish(),
  })
  .loose();

export const ConversationDetailSchema = z
  .object({
    uuid: z.string(),
    name: z.string().optional(),
    updated_at: IsoDate.optional(),
    created_at: IsoDate.optional(),
    // NOT `messages`. See docs/api-notes.md §3.
    chat_messages: z.array(MessageSchema).optional(),
  })
  .loose();

const UsageWindowSchema = z
  .object({
    utilization: z.number().optional(),
    resets_at: IsoDate.nullish(),
  })
  .loose();

export const UsageSchema = z
  .object({
    five_hour: UsageWindowSchema.optional(),
    seven_day: UsageWindowSchema.optional(),
  })
  .loose();

export const OrganizationListSchema = z.array(OrganizationSchema);
export const ConversationListSchema = z.array(ConversationSummarySchema);

export type Organization = z.infer<typeof OrganizationSchema>;
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;
export type Usage = z.infer<typeof UsageSchema>;

/**
 * Parses without throwing. Callers decide whether a miss is fatal.
 *
 * Arrays get element-wise treatment by the caller where it matters: one
 * malformed conversation in a page of 50 must not discard the other 49.
 */
export function parseLenient<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

/** Keeps the valid elements of an array response and reports how many were dropped. */
export function parseArrayLenient<T>(
  schema: z.ZodType<T>,
  value: unknown,
): { items: T[]; dropped: number } {
  if (!Array.isArray(value)) return { items: [], dropped: 0 };

  const items: T[] = [];
  let dropped = 0;
  for (const element of value) {
    const parsed = schema.safeParse(element);
    if (parsed.success) items.push(parsed.data);
    else dropped++;
  }
  return { items, dropped };
}
