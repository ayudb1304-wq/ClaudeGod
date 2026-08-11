import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateAlert, type UsageSnapshot } from '@/core/usage';
import { getEntitlements, resetEntitlementsForTests, setPro } from '@/core/entitlements';
import { applyTierCap, type IndexableConversation } from '@/core/searchIndex';
import { readSourceFiles, stripComments } from './helpers/source';

/**
 * Every Pro gate in FEATURES, asserted in one place.
 *
 * The bug this milestone shipped was not a wrong gate but a missing one:
 * `usageAlerts` existed on the entitlements object and nothing read it, so
 * free users received a paid feature. A per-field coverage check catches the
 * next one of those at build time.
 */

const NOW = new Date('2026-08-11T12:00:00.000Z');

function snapshot(utilization: number): UsageSnapshot {
  return {
    fetchedAt: NOW.toISOString(),
    fiveHour: { utilization, resetsAt: '2026-08-11T16:00:00.000Z' },
    sevenDay: null,
  };
}

beforeEach(() => {
  resetEntitlementsForTests();
});

describe('FEATURES 3.2 — limit alerts are Pro', () => {
  const base = {
    snapshot: snapshot(95),
    thresholdPercent: 80,
    lastAlertedResetsAt: null,
    now: NOW,
  };

  it('does not fire for a free user over the threshold', () => {
    expect(evaluateAlert({ ...base, alertsEnabled: false }).fire).toBe(false);
  });

  it('fires for a Pro user over the threshold', () => {
    expect(evaluateAlert({ ...base, alertsEnabled: true }).fire).toBe(true);
  });

  it('still respects the threshold for Pro users', () => {
    expect(
      evaluateAlert({ ...base, snapshot: snapshot(50), alertsEnabled: true }).fire,
    ).toBe(false);
  });

  it('still fires at most once per window for Pro users', () => {
    const decision = evaluateAlert({
      ...base,
      alertsEnabled: true,
      lastAlertedResetsAt: '2026-08-11T16:00:00.000Z',
    });
    expect(decision.fire).toBe(false);
  });
});

describe('FEATURES 2.1 — search cap is Pro', () => {
  const conversations: IndexableConversation[] = Array.from({ length: 150 }, (_, i) => ({
    uuid: `c${String(i)}`,
    title: `Chat ${String(i)}`,
    updatedAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    messages: [],
  }));

  it('caps free users at 100 conversations', () => {
    expect(applyTierCap(conversations)).toHaveLength(100);
  });

  it('lifts the cap for Pro users', () => {
    setPro(true);
    expect(applyTierCap(conversations)).toHaveLength(150);
  });

  it('records the cap on the entitlements object rather than inline', () => {
    expect(getEntitlements().searchConversationCap).toBe(100);
    setPro(true);
    expect(getEntitlements().searchConversationCap).toBeNull();
  });
});

describe('FEATURES 4.1 / 5.1 / 6.2 — collection and export limits', () => {
  it('free tier carries the documented ceilings', () => {
    const free = getEntitlements();
    expect(free.maxFolders).toBe(3);
    expect(free.maxPrompts).toBe(10);
    expect(free.bulkExport).toBe(false);
    expect(free.promptVariables).toBe(false);
    expect(free.usageAlerts).toBe(false);
  });

  it('Pro lifts every ceiling', () => {
    setPro(true);
    const pro = getEntitlements();
    expect(pro.maxFolders).toBeNull();
    expect(pro.maxPrompts).toBeNull();
    expect(pro.bulkExport).toBe(true);
    expect(pro.promptVariables).toBe(true);
    expect(pro.usageAlerts).toBe(true);
  });
});

describe('gate coverage', () => {
  /**
   * Every gate field must be read somewhere outside entitlements.ts itself.
   * A field with no readers is a feature that is nominally paid and actually
   * free, which is exactly how limit alerts shipped ungated.
   */
  const GATE_FIELDS = [
    'searchConversationCap',
    'maxFolders',
    'maxPrompts',
    'bulkExport',
    'usageAlerts',
    'promptVariables',
  ];

  const readers = readSourceFiles().filter(
    (file) => file.path !== 'src/core/entitlements.ts' && !file.path.includes('devHooks'),
  );

  it.each(GATE_FIELDS)('%s is read by at least one non-dev module', (field) => {
    const users = readers
      .filter((file) => stripComments(file.text).includes(field))
      .map((file) => file.path);

    expect(users.length, `${field} has no readers: the gate is not wired`).toBeGreaterThan(0);
  });
});
