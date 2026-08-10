import { describe, expect, it } from 'vitest';
import { LOCAL_KEYS, SYNC_KEYS } from '@/shared/storage';
import { readSourceFiles, stripComments } from './helpers/source';

/**
 * CLAUDE.md hard rule 4 + ARCHITECTURE §4: conversation content never enters
 * any chrome.storage area. Metadata only. IndexedDB is the sole home for
 * message and artifact text.
 *
 * Enforced from two directions:
 *   1. Only shared/storage.ts may touch chrome.storage at all.
 *   2. That module's key space stays metadata-only.
 */

const STORAGE_WRAPPER = 'src/shared/storage.ts';

/**
 * Key names that would imply conversation content is being stored. Deliberately
 * broad: a key called `messageCache` is a bug even if it holds only ids today.
 */
const CONTENT_FLAVOURED = /message|conversation|artifact|chat|transcript|content|text|body/i;

describe('storage content guard', () => {
  const files = readSourceFiles();

  it('scans a non-empty source tree', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('allows only the storage wrapper to touch chrome.storage', () => {
    const violations = files
      .filter((file) => file.path !== STORAGE_WRAPPER)
      .filter((file) => /chrome\s*\.\s*storage/.test(stripComments(file.text)))
      .map((file) => file.path);

    expect(violations).toEqual([]);
  });

  it('exposes no storage key that implies conversation content', () => {
    const offending = [...SYNC_KEYS, ...LOCAL_KEYS].filter((key) => CONTENT_FLAVOURED.test(key));
    expect(offending).toEqual([]);
  });

  it('keeps the key space closed and small', () => {
    // A growing key list is the likely route to an accidental content write.
    // If this fails, justify the new key rather than bumping the number.
    expect([...SYNC_KEYS, ...LOCAL_KEYS]).toEqual([
      'folders',
      'prompts',
      'settings',
      'licenseCache',
      'onboarding',
      'debugLog',
      // M3: usage percentages/timestamps + last-alert marker. Numbers and
      // ISO dates only — nothing content-flavoured can pass through them.
      'usageCache',
      'usageAlert',
    ]);
  });

  it('never imports the Dexie record types into the storage wrapper', () => {
    const wrapper = files.find((file) => file.path === STORAGE_WRAPPER);
    expect(wrapper).toBeDefined();
    // Importing MessageRecord/ArtifactRecord here would be the first step
    // toward serialising them into chrome.storage.
    expect(stripComments(wrapper?.text ?? '')).not.toMatch(/MessageRecord|ArtifactRecord/);
  });
});
