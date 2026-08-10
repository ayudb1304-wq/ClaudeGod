import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  encodedLength,
  getSyncChunked,
  setSyncChunked,
  splitByBytes,
  StorageQuotaError,
  SYNC_KEYS,
  SYNC_VALUE_BUDGET_BYTES,
} from '@/shared/storage';
import { createSyncStorageMock, QUOTA_BYTES_PER_ITEM } from './helpers/chromeStorage';

const storage = createSyncStorageMock();

beforeEach(() => storage.install());
afterEach(() => storage.uninstall());

describe('chunked sync storage', () => {
  it('round-trips a value that fits in one chunk', async () => {
    await setSyncChunked('folders', [{ id: 'a', name: 'Work' }]);
    await expect(getSyncChunked('folders')).resolves.toEqual([{ id: 'a', name: 'Work' }]);
  });

  it('splits a value larger than the per-item quota and rejoins it', async () => {
    const big = Array.from({ length: 400 }, (_, index) => ({
      id: `conv-${String(index)}`,
      note: 'x'.repeat(40),
    }));

    await setSyncChunked('prompts', big);

    const items = Object.keys(storage.data).filter((key) => key.startsWith('prompts'));
    expect(items.length).toBeGreaterThan(2);
    for (const [key, value] of Object.entries(storage.data)) {
      expect(encodedLength(key + JSON.stringify(value))).toBeLessThanOrEqual(QUOTA_BYTES_PER_ITEM);
    }
    await expect(getSyncChunked('prompts')).resolves.toEqual(big);
  });

  it('drops slices left over when a value shrinks', async () => {
    await setSyncChunked(
      'folders',
      Array.from({ length: 400 }, (_, i) => ({ id: String(i), note: 'x'.repeat(40) })),
    );
    const wide = Object.keys(storage.data).length;
    expect(wide).toBeGreaterThan(2);

    await setSyncChunked('folders', [{ id: 'only' }]);

    expect(Object.keys(storage.data).length).toBeLessThan(wide);
    expect(storage.data['folders__1']).toBeUndefined();
    await expect(getSyncChunked('folders')).resolves.toEqual([{ id: 'only' }]);
  });

  it('reports nothing when a slice is missing rather than parsing a truncated value', async () => {
    await setSyncChunked(
      'prompts',
      Array.from({ length: 400 }, (_, i) => ({ id: String(i), note: 'x'.repeat(40) })),
    );
    delete storage.data['prompts__1'];

    await expect(getSyncChunked('prompts')).resolves.toBeUndefined();
  });

  it('returns undefined for a key never written', async () => {
    await expect(getSyncChunked('folders')).resolves.toBeUndefined();
  });

  it('refuses a value beyond the sync budget with a typed error', async () => {
    const huge = [{ id: 'a', body: 'x'.repeat(SYNC_VALUE_BUDGET_BYTES) }];
    await expect(setSyncChunked('prompts', huge)).rejects.toBeInstanceOf(StorageQuotaError);
  });

  it('only ever writes keys derived from the declared key space', async () => {
    await setSyncChunked('folders', [{ id: 'a' }]);
    await setSyncChunked('prompts', [{ id: 'b' }]);

    for (const key of Object.keys(storage.data)) {
      expect(SYNC_KEYS.some((base) => key === base || key.startsWith(`${base}__`))).toBe(true);
    }
  });
});

function hasLoneSurrogate(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe('splitByBytes', () => {
  it('keeps every piece within the byte budget for multi-byte text', () => {
    const text = '⌘漢字'.repeat(500);
    const parts = splitByBytes(text, 100);

    expect(parts.join('')).toBe(text);
    for (const part of parts) expect(encodedLength(part)).toBeLessThanOrEqual(100);
  });

  it('never splits a surrogate pair', () => {
    const text = '🙂'.repeat(50);
    const parts = splitByBytes(text, 9);

    expect(parts.join('')).toBe(text);
    for (const part of parts) expect(hasLoneSurrogate(part)).toBe(false);
  });

  it('returns nothing for an empty string', () => {
    expect(splitByBytes('', 100)).toEqual([]);
  });
});
