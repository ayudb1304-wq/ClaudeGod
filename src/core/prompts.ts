import { getEntitlements } from './entitlements';
import { getSyncChunked, setSyncChunked, StorageQuotaError } from '@/shared/storage';

/**
 * Prompt library (FEATURES 5.1).
 *
 * Prompts are the user's own text, not conversation content, so chrome.storage
 * .sync is the right home for them (hard rule 4 is about claude.ai data) and
 * they follow the user between devices.
 *
 * The picker in Claude's composer reads from here; insertion itself lives in
 * content/ui/slashPicker.ts because it has to negotiate with Claude's editor.
 */

export interface Prompt {
  id: string;
  title: string;
  body: string;
  /** Free-form grouping label; empty string means uncategorised. */
  category: string;
  createdAt: string;
  updatedAt: string;
}

export const MAX_PROMPT_TITLE_LENGTH = 80;
export const MAX_PROMPT_BODY_LENGTH = 8000;

/** Thrown when the free tier's prompt allowance is used up. */
export class PromptLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Prompt limit of ${String(limit)} reached`);
    this.name = 'PromptLimitError';
  }
}

export { StorageQuotaError };

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

const VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Names of `{{variable}}` placeholders, in first-appearance order and deduped
 * so a name used three times is asked for once.
 */
export function parseVariables(body: string): string[] {
  const names: string[] = [];
  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * Substitutes collected values. A placeholder with no value is left verbatim
 * rather than replaced with an empty string: a visible `{{topic}}` in the
 * composer is an obvious prompt to the user, a silent gap is not.
 */
export function fillVariables(body: string, values: Record<string, string>): string {
  return body.replace(VARIABLE_PATTERN, (whole, rawName: string) => {
    const value = values[rawName.trim()];
    return value === undefined || value === '' ? whole : value;
  });
}

// ---------------------------------------------------------------------------
// Narrowing
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function narrowPrompt(raw: unknown): Prompt | null {
  const record = asRecord(raw);
  const id = record['id'];
  if (typeof id !== 'string' || id.length === 0) return null;
  return {
    id,
    title: stringOr(record['title'], ''),
    body: stringOr(record['body'], ''),
    category: stringOr(record['category'], ''),
    createdAt: stringOr(record['createdAt'], ''),
    updatedAt: stringOr(record['updatedAt'], ''),
  };
}

export function narrowPrompts(raw: unknown): Prompt[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(narrowPrompt).filter((prompt): prompt is Prompt => prompt !== null);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let cache: Prompt[] = [];
let loaded = false;
const listeners = new Set<(prompts: Prompt[]) => void>();

export function getPrompts(): Prompt[] {
  return cache;
}

export function subscribePrompts(listener: (prompts: Prompt[]) => void): () => void {
  listeners.add(listener);
  listener(cache);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(cache);
    } catch {
      /* UI listeners are best-effort */
    }
  }
}

export async function loadPrompts(): Promise<Prompt[]> {
  try {
    cache = narrowPrompts(await getSyncChunked('prompts'));
  } catch {
    cache = [];
  }
  loaded = true;
  emit();
  return cache;
}

async function ensureLoaded(): Promise<void> {
  if (!loaded) await loadPrompts();
}

async function commit(next: Prompt[]): Promise<void> {
  const previous = cache;
  cache = next;
  emit();
  try {
    await setSyncChunked('prompts', next);
  } catch (error) {
    cache = previous;
    emit();
    throw error;
  }
}

export function resetPromptsForTests(): void {
  cache = [];
  loaded = false;
  listeners.clear();
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface PromptDraft {
  title: string;
  body: string;
  category?: string;
}

function clean(draft: PromptDraft): Pick<Prompt, 'title' | 'body' | 'category'> {
  return {
    title: draft.title.trim().slice(0, MAX_PROMPT_TITLE_LENGTH) || 'Untitled prompt',
    body: draft.body.slice(0, MAX_PROMPT_BODY_LENGTH),
    category: (draft.category ?? '').trim(),
  };
}

export async function createPrompt(draft: PromptDraft): Promise<Prompt> {
  await ensureLoaded();

  const limit = getEntitlements().maxPrompts;
  if (limit !== null && cache.length >= limit) throw new PromptLimitError(limit);

  const now = new Date().toISOString();
  const prompt: Prompt = {
    id: crypto.randomUUID(),
    ...clean(draft),
    createdAt: now,
    updatedAt: now,
  };
  await commit([...cache, prompt]);
  return prompt;
}

export async function updatePrompt(id: string, draft: PromptDraft): Promise<void> {
  await ensureLoaded();
  if (!cache.some((prompt) => prompt.id === id)) return;
  const now = new Date().toISOString();
  await commit(
    cache.map((prompt) =>
      prompt.id === id ? { ...prompt, ...clean(draft), updatedAt: now } : prompt,
    ),
  );
}

export async function deletePrompt(id: string): Promise<void> {
  await ensureLoaded();
  const next = cache.filter((prompt) => prompt.id !== id);
  if (next.length === cache.length) return;
  await commit(next);
}

export function isPromptLimitReached(prompts: Prompt[] = cache): boolean {
  const limit = getEntitlements().maxPrompts;
  return limit !== null && prompts.length >= limit;
}

// ---------------------------------------------------------------------------
// Picker filtering
// ---------------------------------------------------------------------------

/**
 * Ranks prompts for the `/` picker. Title matches beat body matches, and a
 * title that starts with what was typed beats one that merely contains it —
 * the ordering people expect from every other command palette.
 */
export function filterPrompts(prompts: Prompt[], query: string): Prompt[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return prompts;

  const scored: { prompt: Prompt; score: number }[] = [];
  for (const prompt of prompts) {
    const title = prompt.title.toLowerCase();
    const score = title.startsWith(needle)
      ? 3
      : title.includes(needle)
        ? 2
        : prompt.category.toLowerCase().includes(needle)
          ? 1
          : prompt.body.toLowerCase().includes(needle)
            ? 0
            : -1;
    if (score >= 0) scored.push({ prompt, score });
  }

  return scored.sort((left, right) => right.score - left.score).map((entry) => entry.prompt);
}
