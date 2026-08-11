import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRACE_PERIOD_DAYS,
  REVALIDATE_AFTER_DAYS,
  activateLicense,
  applyStoredLicense,
  deriveStatus,
  isProStatus,
  needsRevalidation,
  removeLicense,
  revalidateLicense,
  type LicenseRecord,
} from '@/core/licenseState';
import { LicenseError, type LicenseProvider } from '@/core/license';
import { getEntitlements, resetEntitlementsForTests } from '@/core/entitlements';
import { createSyncStorageMock, type StorageMock } from './helpers/chromeStorage';

/**
 * The licence lifecycle's whole risk is date arithmetic and one asymmetry:
 * an explicit server refusal revokes immediately, while an unreachable server
 * must not. Getting that backwards either robs paying customers during an
 * outage or keeps refunded ones on Pro forever.
 */

const NOW = new Date('2026-08-11T12:00:00.000Z');

function record(daysAgo: number): LicenseRecord {
  const validated = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return {
    key: 'PRO-AAAA-BBBB',
    instanceId: 'lki_123',
    activatedAt: validated.toISOString(),
    lastValidatedAt: validated.toISOString(),
    productId: 'prod_1',
    customerEmail: 'buyer@example.com',
  };
}

function provider(overrides: Partial<LicenseProvider> = {}): LicenseProvider {
  return {
    activate: () =>
      Promise.resolve({ instanceId: 'lki_new', productId: 'prod_1', customerEmail: 'b@e.com' }),
    validate: () => Promise.resolve(true),
    deactivate: () => Promise.resolve(),
    ...overrides,
  };
}

let storage: StorageMock;

beforeEach(() => {
  storage?.uninstall();
  storage = createSyncStorageMock();
  storage.install();
  resetEntitlementsForTests();
});

describe('deriveStatus', () => {
  it('is active inside the revalidation window', () => {
    expect(deriveStatus(record(1), NOW)).toBe('active');
    expect(deriveStatus(record(REVALIDATE_AFTER_DAYS - 0.1), NOW)).toBe('active');
  });

  it('enters grace past the revalidation window', () => {
    expect(deriveStatus(record(REVALIDATE_AFTER_DAYS + 1), NOW)).toBe('grace');
    expect(deriveStatus(record(GRACE_PERIOD_DAYS - 0.1), NOW)).toBe('grace');
  });

  it('expires only after the full grace period', () => {
    expect(deriveStatus(record(GRACE_PERIOD_DAYS + 0.1), NOW)).toBe('expired');
  });

  it('reports none without a record', () => {
    expect(deriveStatus(null, NOW)).toBe('none');
  });

  it('treats an unparseable date as expired rather than as valid forever', () => {
    const broken = { ...record(1), lastValidatedAt: 'not a date' };
    expect(deriveStatus(broken, NOW)).toBe('expired');
  });

  it('grants Pro during grace but not after expiry', () => {
    expect(isProStatus('active')).toBe(true);
    expect(isProStatus('grace')).toBe(true);
    expect(isProStatus('expired')).toBe(false);
    expect(isProStatus('revoked')).toBe(false);
    expect(isProStatus('none')).toBe(false);
  });
});

describe('needsRevalidation', () => {
  it('is false inside the window and true past it', () => {
    expect(needsRevalidation(record(3), NOW)).toBe(false);
    expect(needsRevalidation(record(REVALIDATE_AFTER_DAYS + 0.5), NOW)).toBe(true);
  });

  it('is false with no record, so we never call out for a free user', () => {
    expect(needsRevalidation(null, NOW)).toBe(false);
  });
});

describe('activateLicense', () => {
  it('stores the instance and unlocks Pro', async () => {
    const outcome = await activateLicense('PRO-KEY', 'Chrome on Mac', provider(), NOW);

    expect(outcome.error).toBeNull();
    expect(outcome.state.status).toBe('active');
    expect(outcome.state.record?.instanceId).toBe('lki_new');
    expect(getEntitlements().isPro).toBe(true);
  });

  it('trims the pasted key, since copy-paste adds whitespace', async () => {
    const activate = vi.fn(() =>
      Promise.resolve({ instanceId: 'lki_1', productId: null, customerEmail: null }),
    );
    await activateLicense('  PRO-KEY \n', 'Device', provider({ activate }), NOW);

    expect(activate).toHaveBeenCalledWith('PRO-KEY', 'Device');
  });

  it('rejects an empty key without calling the server', async () => {
    const activate = vi.fn();
    const outcome = await activateLicense('   ', 'Device', provider({ activate }), NOW);

    expect(activate).not.toHaveBeenCalled();
    expect(outcome.error?.reason).toBe('not-found');
    expect(getEntitlements().isPro).toBe(false);
  });

  it('surfaces the activation-limit failure distinctly', async () => {
    const outcome = await activateLicense(
      'PRO-KEY',
      'Device',
      provider({ activate: () => Promise.reject(new LicenseError('limit-reached')) }),
      NOW,
    );

    expect(outcome.error?.reason).toBe('limit-reached');
    expect(getEntitlements().isPro).toBe(false);
  });
});

describe('revalidateLicense', () => {
  it('refreshes the timestamp when the server confirms the key', async () => {
    await activateLicense('PRO-KEY', 'Device', provider(), new Date(NOW.getTime() - 8 * 86400000));

    const state = await revalidateLicense(provider({ validate: () => Promise.resolve(true) }), NOW);

    expect(state.status).toBe('active');
    expect(state.record?.lastValidatedAt).toBe(NOW.toISOString());
    expect(getEntitlements().isPro).toBe(true);
  });

  it('revokes immediately when the server says the key is invalid', async () => {
    await activateLicense('PRO-KEY', 'Device', provider(), NOW);

    const state = await revalidateLicense(provider({ validate: () => Promise.resolve(false) }), NOW);

    // Refund or chargeback: downgrade at once, and drop the stored record.
    expect(state.status).toBe('revoked');
    expect(state.record).toBeNull();
    expect(getEntitlements().isPro).toBe(false);
  });

  it('keeps Pro during grace when the server is unreachable', async () => {
    const activatedAt = new Date(NOW.getTime() - 9 * 86400000);
    await activateLicense('PRO-KEY', 'Device', provider(), activatedAt);

    const state = await revalidateLicense(
      provider({ validate: () => Promise.reject(new LicenseError('network')) }),
      NOW,
    );

    // 9 days since validation: past revalidation, inside the 14-day grace.
    expect(state.status).toBe('grace');
    expect(getEntitlements().isPro).toBe(true);
  });

  it('drops to expired once grace runs out with the server still unreachable', async () => {
    const activatedAt = new Date(NOW.getTime() - 20 * 86400000);
    await activateLicense('PRO-KEY', 'Device', provider(), activatedAt);

    const state = await revalidateLicense(
      provider({ validate: () => Promise.reject(new LicenseError('network')) }),
      NOW,
    );

    expect(state.status).toBe('expired');
    expect(getEntitlements().isPro).toBe(false);
  });

  it('does nothing and stays free when there is no record', async () => {
    const validate = vi.fn();
    const state = await revalidateLicense(provider({ validate }), NOW);

    expect(validate).not.toHaveBeenCalled();
    expect(state.status).toBe('none');
  });
});

describe('applyStoredLicense', () => {
  it('rehydrates entitlements from storage after a worker restart', async () => {
    await activateLicense('PRO-KEY', 'Device', provider(), NOW);
    resetEntitlementsForTests();
    expect(getEntitlements().isPro).toBe(false);

    await applyStoredLicense(NOW);

    expect(getEntitlements().isPro).toBe(true);
  });

  it('ignores a malformed stored record instead of throwing', async () => {
    await chrome.storage.local.set({ licenseCache: { nonsense: true } });

    const state = await applyStoredLicense(NOW);

    expect(state.status).toBe('none');
    expect(getEntitlements().isPro).toBe(false);
  });
});

describe('removeLicense', () => {
  it('frees the seat and downgrades', async () => {
    await activateLicense('PRO-KEY', 'Device', provider(), NOW);
    const deactivate = vi.fn(() => Promise.resolve());

    await removeLicense(provider({ deactivate }));

    expect(deactivate).toHaveBeenCalledWith('PRO-KEY', 'lki_new');
    expect(getEntitlements().isPro).toBe(false);
  });

  it('still removes locally when the server call fails', async () => {
    await activateLicense('PRO-KEY', 'Device', provider(), NOW);

    await removeLicense(provider({ deactivate: () => Promise.reject(new Error('offline')) }));

    // A seat the server still counts beats refusing to disconnect the machine.
    expect(getEntitlements().isPro).toBe(false);
    expect((await applyStoredLicense(NOW)).status).toBe('none');
  });
});
