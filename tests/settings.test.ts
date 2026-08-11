import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  clampThreshold,
  narrowSettings,
  normaliseShortcutKey,
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
