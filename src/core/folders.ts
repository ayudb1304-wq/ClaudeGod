import { getEntitlements } from './entitlements';
import { getSyncChunked, setSyncChunked, StorageQuotaError } from '@/shared/storage';

/**
 * Folders (FEATURES 4.1).
 *
 * A folder is name + colour + an ordered list of conversation ids, and nothing
 * else: no titles, no snippets, no message text. That is not an accident of the
 * schema — it is CLAUDE.md hard rule 4. Folders live in chrome.storage.sync so
 * they follow the user between devices, and only ids are safe to put there.
 * Titles for the panel are resolved from IndexedDB at render time.
 *
 * Tags-like semantics: a conversation may sit in any number of folders, and
 * deleting a folder only forgets the grouping (the conversations are untouched,
 * both here and on claude.ai — we never write to claude.ai at all).
 */

export interface Folder {
  id: string;
  name: string;
  color: string;
  /** Conversation uuids, most recently added first. Ids only. */
  convIds: string[];
  createdAt: string;
}

/** Deliberately muted; the panel sits next to Claude's own UI all day. */
export const FOLDER_COLORS = [
  '#6f8fd9',
  '#5aa17f',
  '#d9a441',
  '#e07a5f',
  '#a37fc0',
  '#7f8c8d',
] as const;

export const MAX_FOLDER_NAME_LENGTH = 60;

/** Thrown when the free tier's folder allowance is used up (FEATURES 4.1). */
export class FolderLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Folder limit of ${String(limit)} reached`);
    this.name = 'FolderLimitError';
  }
}

export { StorageQuotaError };

// ---------------------------------------------------------------------------
// Narrowing
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function narrowFolder(raw: unknown): Folder | null {
  const record = asRecord(raw);
  const id = record['id'];
  if (typeof id !== 'string' || id.length === 0) return null;

  const convIds = Array.isArray(record['convIds'])
    ? record['convIds'].filter((value): value is string => typeof value === 'string')
    : [];

  return {
    id,
    name: typeof record['name'] === 'string' ? record['name'] : '',
    color: typeof record['color'] === 'string' ? record['color'] : FOLDER_COLORS[0],
    // Dedupe on read: a merge from two devices can legitimately produce
    // duplicates, and a duplicated row in the panel looks like a bug.
    convIds: [...new Set(convIds)],
    createdAt: typeof record['createdAt'] === 'string' ? record['createdAt'] : '',
  };
}

/** Our own data, so plain narrowing; zod is reserved for claude.ai responses. */
export function narrowFolders(raw: unknown): Folder[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(narrowFolder).filter((folder): folder is Folder => folder !== null);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let cache: Folder[] = [];
let loaded = false;
const listeners = new Set<(folders: Folder[]) => void>();

export function getFolders(): Folder[] {
  return cache;
}

export function subscribeFolders(listener: (folders: Folder[]) => void): () => void {
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

/** Reads storage into the cache. Safe to call repeatedly (e.g. on sync change). */
export async function loadFolders(): Promise<Folder[]> {
  try {
    cache = narrowFolders(await getSyncChunked('folders'));
  } catch {
    // storage.sync throttles and can fail transiently. An empty list is wrong
    // but harmless; a thrown error would take the whole panel down.
    cache = [];
  }
  loaded = true;
  emit();
  return cache;
}

async function ensureLoaded(): Promise<void> {
  if (!loaded) await loadFolders();
}

async function commit(next: Folder[]): Promise<void> {
  const previous = cache;
  cache = next;
  emit();
  try {
    await setSyncChunked('folders', next);
  } catch (error) {
    // Roll the UI back rather than showing a folder that does not exist.
    cache = previous;
    emit();
    throw error;
  }
}

export function resetFoldersForTests(): void {
  cache = [];
  loaded = false;
  listeners.clear();
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function cleanName(name: string): string {
  return name.trim().slice(0, MAX_FOLDER_NAME_LENGTH);
}

function newId(): string {
  return crypto.randomUUID();
}

export async function createFolder(name: string, color?: string): Promise<Folder> {
  await ensureLoaded();

  const limit = getEntitlements().maxFolders;
  if (limit !== null && cache.length >= limit) throw new FolderLimitError(limit);

  const folder: Folder = {
    id: newId(),
    name: cleanName(name) || 'New folder',
    color: color ?? FOLDER_COLORS[cache.length % FOLDER_COLORS.length] ?? FOLDER_COLORS[0],
    convIds: [],
    createdAt: new Date().toISOString(),
  };

  await commit([...cache, folder]);
  return folder;
}

async function update(id: string, change: (folder: Folder) => Folder): Promise<void> {
  await ensureLoaded();
  if (!cache.some((folder) => folder.id === id)) return;
  await commit(cache.map((folder) => (folder.id === id ? change(folder) : folder)));
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const cleaned = cleanName(name);
  if (!cleaned) return;
  await update(id, (folder) => ({ ...folder, name: cleaned }));
}

export async function setFolderColor(id: string, color: string): Promise<void> {
  await update(id, (folder) => ({ ...folder, color }));
}

/** Removes the grouping only. Conversations are never touched (FEATURES 4.1). */
export async function deleteFolder(id: string): Promise<void> {
  await ensureLoaded();
  const next = cache.filter((folder) => folder.id !== id);
  if (next.length === cache.length) return;
  await commit(next);
}

export async function addConversationToFolder(id: string, convUuid: string): Promise<void> {
  await ensureLoaded();
  const folder = cache.find((candidate) => candidate.id === id);
  // Already there: a repeat drop is a no-op, not a duplicate row and not a
  // storage write.
  if (!folder || folder.convIds.includes(convUuid)) return;
  await update(id, (current) => ({ ...current, convIds: [convUuid, ...current.convIds] }));
}

export async function removeConversationFromFolder(id: string, convUuid: string): Promise<void> {
  await ensureLoaded();
  const folder = cache.find((candidate) => candidate.id === id);
  if (!folder?.convIds.includes(convUuid)) return;
  await update(id, (current) => ({
    ...current,
    convIds: current.convIds.filter((uuid) => uuid !== convUuid),
  }));
}

/** Multi-folder membership, for showing a conversation's folder chips. */
export function foldersContaining(convUuid: string, folders: Folder[] = cache): Folder[] {
  return folders.filter((folder) => folder.convIds.includes(convUuid));
}

/** True when another folder cannot be created on the current tier. */
export function isFolderLimitReached(folders: Folder[] = cache): boolean {
  const limit = getEntitlements().maxFolders;
  return limit !== null && folders.length >= limit;
}
