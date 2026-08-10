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
export const SYNC_KEYS = ['folders', 'prompts', 'settings'] as const;

/** Device-local. License cache lives here, never in sync (ARCHITECTURE §4). */
export const LOCAL_KEYS = ['licenseCache', 'onboarding', 'debugLog'] as const;

export type SyncKey = (typeof SYNC_KEYS)[number];
export type LocalKey = (typeof LOCAL_KEYS)[number];

export async function getSync<T>(key: SyncKey): Promise<T | undefined> {
  const result = await chrome.storage.sync.get(key);
  return result[key] as T | undefined;
}

export async function setSync(key: SyncKey, value: unknown): Promise<void> {
  await chrome.storage.sync.set({ [key]: value });
}

export async function getLocal<T>(key: LocalKey): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

export async function setLocal(key: LocalKey, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/** Settings → "Delete all local data" (FEATURES 8.1). */
export async function clearAllStorage(): Promise<void> {
  await chrome.storage.sync.clear();
  await chrome.storage.local.clear();
}
