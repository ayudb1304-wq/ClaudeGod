import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Usage } from '@/api/types';
import {
  ALERT_STALE_AFTER_MS,
  clampAlertThreshold,
  evaluateAlert,
  formatDuration,
  formatTimeUntil,
  getUsageState,
  normalizeUsage,
  readCachedUsage,
  refreshUsage,
  resetUsageStateForTests,
  type UsageAdapter,
  type UsageSnapshot,
} from '@/core/usage';

const NOW = new Date('2026-08-10T12:00:00Z');

// ---------------------------------------------------------------------------
// chrome.storage mock (shared/storage is a thin wrapper over it)
// ---------------------------------------------------------------------------

const localData: Record<string, unknown> = {};

beforeEach(() => {
  resetUsageStateForTests();
  for (const key of Object.keys(localData)) delete localData[key];

  globalThis.chrome = {
    storage: {
      local: {
        get: (key: string) => Promise.resolve({ [key]: localData[key] }),
        set: (items: Record<string, unknown>) => {
          Object.assign(localData, items);
          return Promise.resolve();
        },
      },
    },
  } as unknown as typeof chrome;
});

afterEach(() => {
  // @ts-expect-error test cleanup of the global mock
  delete globalThis.chrome;
  vi.restoreAllMocks();
});

function usageFixture(overrides: Partial<Usage> = {}): Usage {
  return {
    five_hour: { utilization: 61, resets_at: '2026-08-10T16:50:00.094759+00:00' },
    seven_day: { utilization: 23, resets_at: '2026-08-13T00:00:00+00:00' },
    // Internal codename keys churn; the schema is loose so they just ride along.
    amber_ladder: { whatever: true },
    ...overrides,
  };
}

function snapshotFixture(overrides: Partial<UsageSnapshot> = {}): UsageSnapshot {
  return {
    fiveHour: { utilization: 85, resetsAt: '2026-08-10T16:50:00Z' },
    sevenDay: { utilization: 23, resetsAt: null },
    fetchedAt: NOW.toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeUsage
// ---------------------------------------------------------------------------

describe('normalizeUsage', () => {
  it('reads both windows straight from the API', () => {
    const snapshot = normalizeUsage(usageFixture(), NOW);
    expect(snapshot).toEqual({
      fiveHour: { utilization: 61, resetsAt: '2026-08-10T16:50:00.094759+00:00' },
      sevenDay: { utilization: 23, resetsAt: '2026-08-13T00:00:00+00:00' },
      fetchedAt: NOW.toISOString(),
    });
  });

  it('degrades to the surviving window when one is unusable', () => {
    const snapshot = normalizeUsage(
      usageFixture({ five_hour: { utilization: undefined } }),
      NOW,
    );
    expect(snapshot?.fiveHour).toBeNull();
    expect(snapshot?.sevenDay?.utilization).toBe(23);
  });

  it('returns null when neither window carries a usable number', () => {
    expect(normalizeUsage(null, NOW)).toBeNull();
    expect(normalizeUsage({}, NOW)).toBeNull();
    expect(
      normalizeUsage(
        usageFixture({
          five_hour: { utilization: undefined },
          seven_day: undefined,
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it('clamps out-of-range utilization instead of trusting it', () => {
    const snapshot = normalizeUsage(
      usageFixture({
        five_hour: { utilization: 150, resets_at: null },
        seven_day: { utilization: -5, resets_at: null },
      }),
      NOW,
    );
    expect(snapshot?.fiveHour?.utilization).toBe(100);
    expect(snapshot?.sevenDay?.utilization).toBe(0);
  });

  it('drops a non-string resets_at rather than crashing the countdown', () => {
    const snapshot = normalizeUsage(
      usageFixture({
        five_hour: { utilization: 61, resets_at: 12345 } as unknown as Usage['five_hour'],
      }),
      NOW,
    );
    expect(snapshot?.fiveHour).toEqual({ utilization: 61, resetsAt: null });
  });
});

// ---------------------------------------------------------------------------
// refreshUsage + store + cache
// ---------------------------------------------------------------------------

describe('refreshUsage', () => {
  function fakeAdapter(usage: Usage | null): UsageAdapter & { orgCalls: () => number } {
    let orgCalls = 0;
    return {
      getChatOrganization: () => {
        orgCalls++;
        return Promise.resolve({ uuid: 'org-1', capabilities: ['chat'] });
      },
      getUsage: () => Promise.resolve(usage),
      orgCalls: () => orgCalls,
    };
  }

  it('publishes ok state and persists the snapshot for popup and worker', async () => {
    await refreshUsage(fakeAdapter(usageFixture()), NOW);

    expect(getUsageState()).toEqual({
      kind: 'ok',
      snapshot: normalizeUsage(usageFixture(), NOW),
    });
    expect(await readCachedUsage()).toEqual(normalizeUsage(usageFixture(), NOW));
  });

  it('caches the org id across refreshes (one org lookup, not one per poll)', async () => {
    const adapter = fakeAdapter(usageFixture());
    await refreshUsage(adapter, NOW);
    await refreshUsage(adapter, NOW);
    expect(adapter.orgCalls()).toBe(1);
  });

  it('goes unavailable on an unparseable response and keeps the last cache', async () => {
    await refreshUsage(fakeAdapter(usageFixture()), NOW);
    await refreshUsage(fakeAdapter(null), NOW);

    expect(getUsageState()).toEqual({ kind: 'unavailable' });
    // The cached copy stays: it is honestly dated via fetchedAt.
    expect(await readCachedUsage()).not.toBeNull();
  });

  it('goes unavailable when the adapter throws', async () => {
    await refreshUsage(
      {
        getChatOrganization: () => Promise.reject(new Error('exhausted retries')),
        getUsage: () => Promise.resolve(null),
      },
      NOW,
    );
    expect(getUsageState()).toEqual({ kind: 'unavailable' });
  });

  it('goes unavailable when no chat org exists', async () => {
    await refreshUsage(
      {
        getChatOrganization: () => Promise.resolve(null),
        getUsage: () => Promise.resolve(usageFixture()),
      },
      NOW,
    );
    expect(getUsageState()).toEqual({ kind: 'unavailable' });
  });
});

describe('readCachedUsage', () => {
  it('rejects junk shapes instead of propagating them', async () => {
    localData['usageCache'] = { fetchedAt: 42, fiveHour: 'nope' };
    expect(await readCachedUsage()).toBeNull();

    localData['usageCache'] = 'garbage';
    expect(await readCachedUsage()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Alert logic (FEATURES 3.2: once per window, configurable threshold)
// ---------------------------------------------------------------------------

describe('clampAlertThreshold', () => {
  it('defaults junk to 80 and clamps to 50–95', () => {
    expect(clampAlertThreshold(undefined)).toBe(80);
    expect(clampAlertThreshold('90')).toBe(80);
    expect(clampAlertThreshold(Number.NaN)).toBe(80);
    expect(clampAlertThreshold(30)).toBe(50);
    expect(clampAlertThreshold(99)).toBe(95);
    expect(clampAlertThreshold(82.4)).toBe(82);
  });
});

describe('evaluateAlert', () => {
  const base = {
    thresholdPercent: 80,
    lastAlertedResetsAt: null,
    now: NOW,
    // These cases cover threshold, staleness and once-per-window behaviour, so
    // they assume an entitled user. The Pro gate itself is covered in
    // proGates.test.ts.
    alertsEnabled: true,
  };

  it('fires when utilization crosses the threshold', () => {
    const decision = evaluateAlert({ ...base, snapshot: snapshotFixture() });
    expect(decision).toEqual({
      fire: true,
      resetsAt: '2026-08-10T16:50:00Z',
      utilization: 85,
    });
  });

  it('stays quiet below the threshold', () => {
    const snapshot = snapshotFixture({ fiveHour: { utilization: 79, resetsAt: '2026-08-10T16:50:00Z' } });
    expect(evaluateAlert({ ...base, snapshot }).fire).toBe(false);
  });

  it('fires at most once per window: same resets_at never repeats', () => {
    const decision = evaluateAlert({
      ...base,
      snapshot: snapshotFixture(),
      lastAlertedResetsAt: '2026-08-10T16:50:00Z',
    });
    expect(decision.fire).toBe(false);
  });

  it('fires again in the next window (new resets_at)', () => {
    const decision = evaluateAlert({
      ...base,
      snapshot: snapshotFixture({ fiveHour: { utilization: 92, resetsAt: '2026-08-10T21:50:00Z' } }),
      lastAlertedResetsAt: '2026-08-10T16:50:00Z',
    });
    expect(decision.fire).toBe(true);
  });

  it('never alerts on a stale snapshot', () => {
    const stale = snapshotFixture({
      fetchedAt: new Date(NOW.getTime() - ALERT_STALE_AFTER_MS - 1).toISOString(),
    });
    expect(evaluateAlert({ ...base, snapshot: stale }).fire).toBe(false);
  });

  it('skips when the dedupe key (resets_at) is missing', () => {
    const snapshot = snapshotFixture({ fiveHour: { utilization: 95, resetsAt: null } });
    expect(evaluateAlert({ ...base, snapshot }).fire).toBe(false);
  });

  it('skips on no snapshot or unreadable fetchedAt', () => {
    expect(evaluateAlert({ ...base, snapshot: null }).fire).toBe(false);
    const broken = snapshotFixture({ fetchedAt: 'not-a-date' });
    expect(evaluateAlert({ ...base, snapshot: broken }).fire).toBe(false);
  });

  it('respects a configured threshold', () => {
    const snapshot = snapshotFixture({ fiveHour: { utilization: 55, resetsAt: '2026-08-10T16:50:00Z' } });
    expect(evaluateAlert({ ...base, snapshot, thresholdPercent: 50 }).fire).toBe(true);
    expect(evaluateAlert({ ...base, snapshot, thresholdPercent: 95 }).fire).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe('duration formatting', () => {
  it('formats sub-minute, minutes, and hours', () => {
    expect(formatDuration(30_000)).toBe('under a minute');
    expect(formatDuration(45 * 60_000)).toBe('45m');
    expect(formatDuration(2 * 3_600_000 + 5 * 60_000)).toBe('2h 05m');
  });

  it('formatTimeUntil handles absent, junk, and past timestamps', () => {
    expect(formatTimeUntil(null, NOW)).toBeNull();
    expect(formatTimeUntil('not-a-date', NOW)).toBeNull();
    expect(formatTimeUntil('2026-08-10T11:00:00Z', NOW)).toBeNull();
    expect(formatTimeUntil('2026-08-10T16:50:00Z', NOW)).toBe('4h 50m');
  });
});
