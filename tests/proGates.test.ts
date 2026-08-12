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

describe('design system integrity', () => {
  /**
   * theme.ts is the only place a raw colour may exist. The revamp started
   * because nine ad-hoc greys had accumulated across five surfaces built at
   * different times; without a guard the same drift restarts immediately.
   */
  // src/shared is in the list because UpgradeLink hid a raw hex there for two
  // commits: it renders UI but does not live in a UI folder.
  const UI_DIRS = ['src/content/ui/', 'src/popup/', 'src/options/', 'src/shared/'];
  const THEME_FILE = 'src/shared/theme.ts';
  const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/;

  it('defines every colour in theme.ts and nowhere else', () => {
    const offenders = readSourceFiles()
      .filter((file) => file.path !== THEME_FILE)
      .filter((file) => UI_DIRS.some((dir) => file.path.startsWith(dir)))
      .filter((file) => RAW_COLOUR.test(stripComments(file.text)))
      .map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  it('never uses the fill accent as text, which fails contrast', () => {
    // #FF7820 on white is 2.64:1. Links and badges must take --cg-accent-text
    // (5.5:1) instead. This is the whole reason the two tokens are separate.
    const offenders = readSourceFiles()
      .filter((file) => file.path !== THEME_FILE)
      // Lookbehind excludes `accent-color:` and `border-color:`, which are
      // legitimate fill uses on form controls and focus rings.
      .filter((file) => /(?<![-a-z])color:\s*var\(--cg-accent\)/.test(stripComments(file.text)))
      .map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  it('keeps every content-script surface inside a shadow root', () => {
    // Claude owns the page: a surface outside a shadow root inherits their
    // cascade and leaks ours into theirs.
    const hosts = readSourceFiles()
      .filter((file) => file.path.startsWith('src/content/'))
      .filter((file) => stripComments(file.text).includes('document.body.appendChild'))
      .filter((file) => !stripComments(file.text).includes('attachShadow'))
      .map((file) => file.path);

    expect(hosts).toEqual([]);
  });
});

describe('user-facing copy', () => {
  /**
   * The voice rules in strings.ts, enforced where they can be.
   *
   * Rule 2 is the checkable one: implementation vocabulary reaching the user.
   * It leaked twice ("Not in your local copy yet", "Synced storage is full")
   * and the second survived a fix to the first, because each was reviewed
   * where it was written rather than against the whole set.
   */
  const source = readSourceFiles().find((file) => file.path === 'src/shared/strings.ts');
  const body = stripComments(source?.text ?? '');

  const INTERNAL_TERMS = [
    'synced storage',
    'storage.sync',
    'local copy',
    'IndexedDB',
    'adapter',
    'checkpoint',
    'entitlement',
    'chrome.storage',
  ];

  it.each(INTERNAL_TERMS)('never says "%s" to a user', (term) => {
    expect(body.toLowerCase()).not.toContain(term.toLowerCase());
  });

  it('calls indexing one thing, not sync and indexing both', () => {
    // The button says "Start indexing", so a banner saying "Sync paused"
    // describes the same feature by a second name.
    expect(body).not.toMatch(/'Sync paused/);
  });
});
