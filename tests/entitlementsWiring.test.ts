import { beforeEach, describe, expect, it } from 'vitest';
import { initEntitlements, activateLicense } from '@/core/licenseState';
import { getEntitlements, resetEntitlementsForTests } from '@/core/entitlements';
import { readSourceFiles, stripComments } from './helpers/source';
import { createSyncStorageMock, type StorageMock } from './helpers/chromeStorage';
import type { LicenseProvider } from '@/core/license';

/**
 * Regression guard for a shipped bug: a customer activated Pro in settings and
 * bulk export stayed locked in the popup.
 *
 * `entitlements.ts` is module-level memory, so every extension context holds
 * its own copy that starts on the free tier. Any context that reads
 * entitlements must hydrate them from storage, and the failure is silent: no
 * error, no crash, the user simply does not get what they paid for.
 */

const NOW = new Date('2026-08-11T12:00:00.000Z');

/** Lets the storage read and its downstream promise chain settle. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function provider(): LicenseProvider {
  return {
    activate: () =>
      Promise.resolve({ instanceId: 'lki_1', productId: null, customerEmail: null }),
    validate: () => Promise.resolve(true),
    deactivate: () => Promise.resolve(),
  };
}

let storage: StorageMock;

beforeEach(() => {
  storage?.uninstall();
  storage = createSyncStorageMock();
  storage.install();
  resetEntitlementsForTests();
});

describe('every context that reads entitlements also hydrates them', () => {
  /**
   * Entry points, not components. A component may read entitlements freely as
   * long as its context bootstrapped them first.
   */
  const ENTRY_POINTS = [
    'src/popup/main.tsx',
    'src/options/main.tsx',
    'src/content/index.ts',
    'src/background/serviceWorker.ts',
  ];

  const files = readSourceFiles();

  it.each(ENTRY_POINTS)('%s hydrates entitlements on boot', (entry) => {
    const file = files.find((candidate) => candidate.path === entry);
    expect(file, `${entry} not found`).toBeDefined();

    const code = stripComments(file?.text ?? '');
    // Either helper is fine: initEntitlements wraps applyStoredLicense and adds
    // a storage listener; the worker calls the latter directly.
    expect(code).toMatch(/initEntitlements|applyStoredLicense/);
  });
});

describe('initEntitlements', () => {
  it('restores Pro in a fresh context from an existing activation', async () => {
    await activateLicense('PRO-KEY', 'Device', provider(), NOW);

    // Simulate a different context booting: same storage, fresh module state.
    resetEntitlementsForTests();
    expect(getEntitlements().bulkExport).toBe(false);

    initEntitlements();
    await flush();

    expect(getEntitlements().isPro).toBe(true);
    expect(getEntitlements().bulkExport).toBe(true);
    expect(getEntitlements().searchConversationCap).toBeNull();
  });

  it('picks up an activation that happens while the context is already open', async () => {
    initEntitlements();
    await flush();
    expect(getEntitlements().isPro).toBe(false);

    // The options page activates in another context; storage.onChanged fires.
    await activateLicense('PRO-KEY', 'Device', provider(), NOW);
    await flush();

    expect(getEntitlements().isPro).toBe(true);
  });

  it('returns an unsubscribe that detaches the listener', () => {
    const stop = initEntitlements();
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
  });
});
