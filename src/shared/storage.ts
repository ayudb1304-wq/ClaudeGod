/**
 * The only module permitted to touch chrome.storage.
 *
 * CLAUDE.md hard rule 4: conversation content never enters chrome.storage.
 * Metadata only. IndexedDB (core/db.ts) is the sole home for message and
 * artifact text.
 *
 * Enforcement is structural rather than trusted: the key space is a closed
 * union, so there is no key a caller could invent to smuggle message text
 * through. The storage-content guard test asserts both that this list stays
 * metadata-only and that no other module reaches for chrome.storage directly.
 */

/** Synced across devices (Pro benefit). Quotas: 8KB per item, 100KB total. */
export const SYNC_KEYS = [
  'folders',
  'prompts',
  'settings',
  /*
   * The Dodo activation instance id, deliberately synced rather than local.
   *
   * A seat is consumed per activation, and a local-only id is destroyed by
   * every reinstall or new Chrome profile, so honest customers leak seats they
   * can never reclaim. Syncing it means one person holds one activation across
   * all their signed-in profiles, and it survives reinstalls.
   *
   * It is a random UUID: an identifier for a licence seat, carrying nothing
   * about the user and nothing derived from a conversation.
   */
  'licenseInstance',
] as const;

/**
 * Device-local. License cache lives here, never in sync (ARCHITECTURE §4).
 *
 * usageCache holds only numbers and timestamps from /usage (utilization
 * percentages, resets_at, fetchedAt) — metadata, no conversation content.
 * usageAlert holds the resets_at of the last fired notification so "once per
 * window" survives service-worker restarts.
 */
export const LOCAL_KEYS = [
  'licenseCache',
  'onboarding',
  'debugLog',
  'usageCache',
  'usageAlert',
  // M5 (early): indexing consent flag, and a summary of the last sync run
  // (counts + ISO timestamp). Numbers and dates only; no conversation content
  // can reach either, which is what keeps the storage-content guard honest.
  'syncConsent',
  'syncSummary',
] as const;

export type SyncKey = (typeof SYNC_KEYS)[number];
export type LocalKey = (typeof LOCAL_KEYS)[number];

export async function getSync<T>(key: SyncKey): Promise<T | undefined> {
  const result = await chrome.storage.sync.get(key);
  return result[key] as T | undefined;
}

export async function setSync(key: SyncKey, value: unknown): Promise<void> {
  await chrome.storage.sync.set({ [key]: value });
}

// ---------------------------------------------------------------------------
// Chunked sync values (folders, prompts)
// ---------------------------------------------------------------------------

/**
 * chrome.storage.sync enforces 8KB per item and 100KB per profile. Folders and
 * prompts are lists that grow with use, so they are stored as a manifest under
 * the base key plus JSON slices under derived keys (`folders__0`, `folders__1`).
 *
 * Derived keys deliberately carry the base key as a prefix: the key space stays
 * closed (nothing outside SYNC_KEYS can be invented by a caller), which is what
 * keeps the storage-content guard meaningful.
 */
const CHUNK_PAYLOAD_BYTES = 6000;

/**
 * Ceiling for one chunked value, well under the 100KB profile total: `settings`
 * and the other chunked key both need room, and hitting the real quota mid-write
 * is a much worse experience than refusing a save that is already absurd.
 */
export const SYNC_VALUE_BUDGET_BYTES = 40_000;

/** Thrown when a save would not fit. UI catches this and says so calmly. */
export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

function chunkKey(key: SyncKey, index: number): string {
  return `${key}__${String(index)}`;
}

const encoder = new TextEncoder();

export function encodedLength(text: string): number {
  return encoder.encode(text).length;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * Splits a JSON string into pieces that each fit `maxBytes` when UTF-8 encoded.
 *
 * Shrinks by the measured overshoot ratio rather than one character at a time,
 * so a prompt library full of multi-byte text costs a handful of re-encodings
 * instead of thousands.
 */
export function splitByBytes(text: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let rest = text;

  while (rest.length > 0) {
    let take = Math.min(rest.length, maxBytes);
    let size = encodedLength(rest.slice(0, take));
    while (take > 1 && size > maxBytes) {
      take = Math.max(1, Math.floor(take * (maxBytes / size)));
      size = encodedLength(rest.slice(0, take));
    }
    // A lone surrogate would survive storage but not a later JSON.parse.
    if (take < rest.length && take > 1 && isHighSurrogate(rest.charCodeAt(take - 1))) take -= 1;

    chunks.push(rest.slice(0, take));
    rest = rest.slice(take);
  }

  return chunks;
}

interface ChunkManifest {
  chunkCount: number;
}

function asManifest(value: unknown): ChunkManifest | null {
  if (typeof value !== 'object' || value === null) return null;
  const count = (value as Record<string, unknown>)['chunkCount'];
  return typeof count === 'number' && count >= 0 ? { chunkCount: count } : null;
}

export async function getSyncChunked<T>(key: SyncKey): Promise<T | undefined> {
  const manifest = asManifest((await chrome.storage.sync.get(key))[key]);
  if (!manifest) return undefined;

  const keys = Array.from({ length: manifest.chunkCount }, (_, index) => chunkKey(key, index));
  const stored = await chrome.storage.sync.get(keys);

  let joined = '';
  for (const part of keys.map((name) => stored[name])) {
    // A missing slice means an interrupted write or a half-arrived sync from
    // another device. Reporting nothing beats parsing a truncated list.
    if (typeof part !== 'string') return undefined;
    joined += part;
  }

  try {
    return JSON.parse(joined) as T;
  } catch {
    return undefined;
  }
}

export async function setSyncChunked(key: SyncKey, value: unknown): Promise<void> {
  const json = JSON.stringify(value ?? null);
  if (encodedLength(json) > SYNC_VALUE_BUDGET_BYTES) {
    throw new StorageQuotaError(`${key} is too large to sync`);
  }

  const parts = splitByBytes(json, CHUNK_PAYLOAD_BYTES);
  const previous = asManifest((await chrome.storage.sync.get(key))[key]);

  const items: Record<string, unknown> = { [key]: { chunkCount: parts.length } };
  parts.forEach((part, index) => {
    items[chunkKey(key, index)] = part;
  });

  try {
    // Manifest and slices go in one call so a reader never sees a manifest
    // pointing at slices that were not written.
    await chrome.storage.sync.set(items);
  } catch (error) {
    throw new StorageQuotaError(
      error instanceof Error ? error.message : `${key} could not be saved`,
    );
  }

  const stale: string[] = [];
  for (let index = parts.length; index < (previous?.chunkCount ?? 0); index += 1) {
    stale.push(chunkKey(key, index));
  }
  if (stale.length > 0) await chrome.storage.sync.remove(stale);
}

export async function getLocal<T>(key: LocalKey): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

export async function setLocal(key: LocalKey, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/**
 * Notifies when a synced key changes, including edits made in another context
 * (popup writes a folder; the panel on claude.ai repaints) or on another device.
 * Chunked values report their base key, not the derived slice keys.
 */
export function subscribeSyncChanges(listener: (keys: SyncKey[]) => void): () => void {
  const handler = (changes: Record<string, unknown>, area: string): void => {
    if (area !== 'sync') return;
    const touched = SYNC_KEYS.filter((key) =>
      Object.keys(changes).some((changed) => changed === key || changed.startsWith(`${key}__`)),
    );
    if (touched.length > 0) listener(touched);
  };

  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

/**
 * Notifies when a device-local key changes.
 *
 * Needed because entitlements live in per-context module memory: the options
 * page activating a licence must reach the popup and the content script, and
 * storage is the only thing all three share.
 */
export function subscribeLocalChanges(listener: (keys: LocalKey[]) => void): () => void {
  const handler = (changes: Record<string, unknown>, area: string): void => {
    if (area !== 'local') return;
    const touched = LOCAL_KEYS.filter((key) => key in changes);
    if (touched.length > 0) listener(touched);
  };

  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

/** Settings → "Delete all local data" (FEATURES 8.1). */
export async function clearAllStorage(): Promise<void> {
  await chrome.storage.sync.clear();
  await chrome.storage.local.clear();
}

/**
 * Full dump for the dev-hooks bridge (VITE_DEV_HOOKS builds only). Local
 * debugging aid; never transmitted anywhere.
 */
export async function dumpAllStorageForDebug(): Promise<{
  sync: Record<string, unknown>;
  local: Record<string, unknown>;
}> {
  return {
    sync: await chrome.storage.sync.get(null),
    local: await chrome.storage.local.get(null),
  };
}
