import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  clampThreshold,
  narrowSettings,
  normaliseShortcutKey,
  interpretShortcutKeydown,
  readSettings,
  updateSettings,
} from '@/shared/settings';
import { createSyncStorageMock, type StorageMock } from './helpers/chromeStorage';

/**
 * Settings are our own data, so the risk is not malicious input but stale or
 * hand-edited values: a threshold outside 50-95 would silently break the alert
 * contract, and a bad shortcut key would leave the overlay unopenable.
 */

let storage: StorageMock;

beforeEach(() => {
  storage?.uninstall();
  storage = createSyncStorageMock();
  storage.install();
});

describe('clampThreshold', () => {
  it('holds the documented 50-95 range', () => {
    expect(clampThreshold(10)).toBe(50);
    expect(clampThreshold(200)).toBe(95);
    expect(clampThreshold(80)).toBe(80);
  });

  it('rounds fractional values', () => {
    expect(clampThreshold(82.6)).toBe(83);
  });
});

describe('normaliseShortcutKey', () => {
  it('accepts a single letter and lowercases it', () => {
    expect(normaliseShortcutKey('K', 'k')).toBe('k');
  });

  it.each([['digit', '1'], ['multi-char', 'Enter'], ['empty', ''], ['symbol', '/']])(
    'rejects %s and falls back',
    (_label, value) => {
      expect(normaliseShortcutKey(value, 'k')).toBe('k');
    },
  );

  it('rejects non-strings', () => {
    expect(normaliseShortcutKey(null, 'k')).toBe('k');
    expect(normaliseShortcutKey(42, 'k')).toBe('k');
  });
});

describe('narrowSettings', () => {
  it('returns defaults for junk', () => {
    expect(narrowSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(narrowSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps dismissed CTA tags and drops junk entries', () => {
    // A dismissal that fails to survive a read turns a one-time card back into
    // a recurring nag, so the filter must not throw the whole list away.
    expect(narrowSettings({ dismissedCtas: ['bulk-export', 7, null] }).dismissedCtas).toEqual([
      'bulk-export',
    ]);
    expect(narrowSettings({ dismissedCtas: 'bulk-export' }).dismissedCtas).toEqual([]);
  });

  it('clamps a stored threshold outside the range', () => {
    // Written by an older build or edited by hand; must not escape the range.
    expect(narrowSettings({ alertThresholdPercent: 5 }).alertThresholdPercent).toBe(50);
    expect(narrowSettings({ alertThresholdPercent: 300 }).alertThresholdPercent).toBe(95);
  });

  it('repairs a corrupt shortcut without discarding the rest', () => {
    const result = narrowSettings({
      searchShortcut: { key: 'not-a-key', requireShift: true },
      syncPaused: true,
    });

    expect(result.searchShortcut.key).toBe('k');
    expect(result.searchShortcut.requireShift).toBe(true);
    expect(result.syncPaused).toBe(true);
  });

  it('fills new fields on settings written before they existed', () => {
    // Forward-compat: an object stored by the M3 build has no shortcut, no
    // syncPaused and no widget.hidden.
    const legacy = { alertThresholdPercent: 75, usageWidget: { collapsed: true, right: 9, bottom: 9 } };
    const result = narrowSettings(legacy);

    expect(result.alertThresholdPercent).toBe(75);
    expect(result.usageWidget.collapsed).toBe(true);
    expect(result.usageWidget.right).toBe(9);
    expect(result.usageWidget.hidden).toBe(false);
    expect(result.searchShortcut).toEqual(DEFAULT_SETTINGS.searchShortcut);
    expect(result.syncPaused).toBe(false);
  });

  it('keeps a valid custom shortcut', () => {
    const result = narrowSettings({ searchShortcut: { key: 'j', requireShift: true } });
    expect(result.searchShortcut).toEqual({ key: 'j', requireShift: true });
  });
});

describe('round trip through storage', () => {
  it('persists a partial patch without dropping other fields', async () => {
    await updateSettings({ syncPaused: true });
    await updateSettings({ alertThresholdPercent: 90 });

    const settings = await readSettings();
    expect(settings.syncPaused).toBe(true);
    expect(settings.alertThresholdPercent).toBe(90);
    expect(settings.searchShortcut).toEqual(DEFAULT_SETTINGS.searchShortcut);
  });

  it('falls back to defaults when storage throws', async () => {
    storage.uninstall();
    // No chrome global at all: readSettings must still answer.
    await expect(readSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });
});

describe('interpretShortcutKeydown', () => {
  const press = (over: Partial<Parameters<typeof interpretShortcutKeydown>[0]>) =>
    interpretShortcutKeydown({ key: 'k', ctrlKey: false, metaKey: false, shiftKey: false, ...over });

  it('binds a letter held with Ctrl', () => {
    expect(press({ key: 'j', ctrlKey: true })).toEqual({
      kind: 'set',
      value: { key: 'j', requireShift: false },
    });
  });

  it('binds with Cmd on mac', () => {
    expect(press({ key: 'j', metaKey: true })).toMatchObject({ kind: 'set' });
  });

  it('records Shift as part of the binding', () => {
    // Shift uppercases event.key, which must not leak into stored settings.
    expect(press({ key: 'K', ctrlKey: true, shiftKey: true })).toEqual({
      kind: 'set',
      value: { key: 'k', requireShift: true },
    });
  });

  it('cancels on Escape', () => {
    expect(press({ key: 'Escape' })).toEqual({ kind: 'cancel' });
  });

  it.each(['Control', 'Shift', 'Alt', 'Meta'])('ignores the bare %s keydown', (key) => {
    // Holding the modifier fires first; reacting would abort every capture.
    expect(press({ key })).toEqual({ kind: 'ignore' });
  });

  it('rejects a bare letter, explaining why', () => {
    // The whole point of requiring a modifier: a bare letter would fire while
    // the user types into Claude's composer.
    expect(press({ key: 'j' })).toEqual({ kind: 'invalid', reason: 'needs-modifier' });
  });

  it.each([['digit', '1'], ['function key', 'F5'], ['punctuation', '/'], ['space', ' ']])(
    'rejects %s with a modifier held',
    (_label, key) => {
      expect(press({ key, ctrlKey: true })).toEqual({ kind: 'invalid', reason: 'needs-letter' });
    },
  );

  it('never returns a silent no-op for a real press', () => {
    // Every outcome is either a binding, a cancel, or an explanation. "Nothing
    // happened" was the reported bug.
    const outcomes = ['a', '1', 'Escape', 'F1', '/'].map((key) =>
      press({ key, ctrlKey: key !== 'Escape' }),
    );
    expect(outcomes.every((outcome) => outcome.kind !== 'ignore')).toBe(true);
  });
});
