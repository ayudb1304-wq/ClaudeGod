import { getSync, setSync } from './storage';

/**
 * Typed access to the `settings` key in chrome.storage.sync (FEATURES 8.1).
 *
 * Settings are our own data, not external input, so plain narrowing is enough;
 * zod is reserved for claude.ai responses. Unknown or malformed stored values
 * fall back to defaults field by field rather than resetting the whole object.
 */

export interface UsageWidgetSettings {
  collapsed: boolean;
  /** Hidden entirely. The popup still shows usage; only the on-page widget goes. */
  hidden: boolean;
  /** Offsets from the viewport's bottom-right corner, in px. */
  right: number;
  bottom: number;
}

/**
 * Search overlay binding (FEATURES 2.1: "configurable + non-conflicting").
 *
 * Only the letter and whether Shift is required are configurable. Ctrl/Cmd is
 * always required, because a bare letter would fire while the user types into
 * Claude's composer.
 */
export interface ShortcutSettings {
  /** Single lowercase letter. */
  key: string;
  /** When true, plain Ctrl/Cmd+key is left to Claude and only Shift opens us. */
  requireShift: boolean;
}

export interface FolderPanelSettings {
  /** Whether the drawer is expanded. Its handle is always visible. */
  open: boolean;
}

export interface Settings {
  /** FEATURES 3.2: configurable 50–95, default 80. */
  alertThresholdPercent: number;
  usageWidget: UsageWidgetSettings;
  folderPanel: FolderPanelSettings;
  searchShortcut: ShortcutSettings;
  /**
   * FEATURES 8.1 "Pause sync". Blocks indexing runs without deleting anything,
   * so search keeps working over what is already stored.
   */
  syncPaused: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  alertThresholdPercent: 80,
  // Default sits above the sync banner's bottom-right spot so they never overlap.
  usageWidget: { collapsed: false, hidden: false, right: 16, bottom: 64 },
  // Closed by default: an extension that rearranges Claude's layout on install
  // is an extension people uninstall.
  folderPanel: { open: false },
  searchShortcut: { key: 'k', requireShift: false },
  syncPaused: false,
};

/** Letters only, lowercased. Anything else falls back to the default. */
export function normaliseShortcutKey(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const key = raw.trim().toLowerCase();
  return /^[a-z]$/.test(key) ? key : fallback;
}

/** FEATURES 3.2 bounds the threshold at 50–95. */
export function clampThreshold(value: number): number {
  return Math.min(95, Math.max(50, Math.round(value)));
}

/** Modifier presses arrive as their own keydown before the letter does. */
const BARE_MODIFIERS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);

export type ShortcutCapture =
  | { kind: 'cancel' }
  /** Holding a modifier: wait for the letter rather than reacting. */
  | { kind: 'ignore' }
  /** A real press we cannot bind, so the UI must say why. */
  | { kind: 'invalid'; reason: 'needs-modifier' | 'needs-letter' }
  | { kind: 'set'; value: ShortcutSettings };

/**
 * Decides what a keypress means while rebinding the search shortcut.
 *
 * Pure so the rules are testable without a DOM. The UI only has to route the
 * result, which is what keeps "nothing happened" from being a possible outcome:
 * every real press produces either a binding or an explanation.
 */
export function interpretShortcutKeydown(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): ShortcutCapture {
  if (event.key === 'Escape') return { kind: 'cancel' };
  if (BARE_MODIFIERS.has(event.key)) return { kind: 'ignore' };

  // Ctrl/Cmd is mandatory: a bare letter would fire while typing into Claude.
  if (!event.ctrlKey && !event.metaKey) return { kind: 'invalid', reason: 'needs-modifier' };

  const key = normaliseShortcutKey(event.key, '');
  if (!key) return { kind: 'invalid', reason: 'needs-letter' };

  return { kind: 'set', value: { key, requireShift: event.shiftKey } };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function narrowSettings(raw: unknown): Settings {
  const root = asRecord(raw);
  const widget = asRecord(root['usageWidget']);
  const panel = asRecord(root['folderPanel']);
  const shortcut = asRecord(root['searchShortcut']);
  const defaults = DEFAULT_SETTINGS;
  return {
    // Clamped on read, not just on write: a value stored by an older build or
    // edited by hand must not push the alert outside its documented range.
    alertThresholdPercent: clampThreshold(
      numberOr(root['alertThresholdPercent'], defaults.alertThresholdPercent),
    ),
    usageWidget: {
      collapsed: booleanOr(widget['collapsed'], defaults.usageWidget.collapsed),
      hidden: booleanOr(widget['hidden'], defaults.usageWidget.hidden),
      right: numberOr(widget['right'], defaults.usageWidget.right),
      bottom: numberOr(widget['bottom'], defaults.usageWidget.bottom),
    },
    folderPanel: {
      open: booleanOr(panel['open'], defaults.folderPanel.open),
    },
    searchShortcut: {
      key: normaliseShortcutKey(shortcut['key'], defaults.searchShortcut.key),
      requireShift: booleanOr(shortcut['requireShift'], defaults.searchShortcut.requireShift),
    },
    syncPaused: booleanOr(root['syncPaused'], defaults.syncPaused),
  };
}

export async function readSettings(): Promise<Settings> {
  try {
    return narrowSettings(await getSync('settings'));
  } catch {
    // storage.sync can fail transiently (e.g. sync throttling); defaults are
    // always a safe answer for read paths.
    return DEFAULT_SETTINGS;
  }
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = await readSettings();
  await setSync('settings', { ...current, ...patch });
}

export async function updateUsageWidgetSettings(
  patch: Partial<UsageWidgetSettings>,
): Promise<void> {
  const current = await readSettings();
  await setSync('settings', {
    ...current,
    usageWidget: { ...current.usageWidget, ...patch },
  });
}
