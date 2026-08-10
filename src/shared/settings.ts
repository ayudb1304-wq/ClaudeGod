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
  /** Offsets from the viewport's bottom-right corner, in px. */
  right: number;
  bottom: number;
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
}

export const DEFAULT_SETTINGS: Settings = {
  alertThresholdPercent: 80,
  // Default sits above the sync banner's bottom-right spot so they never overlap.
  usageWidget: { collapsed: false, right: 16, bottom: 64 },
  // Closed by default: an extension that rearranges Claude's layout on install
  // is an extension people uninstall.
  folderPanel: { open: false },
};

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
  const defaults = DEFAULT_SETTINGS;
  return {
    alertThresholdPercent: numberOr(root['alertThresholdPercent'], defaults.alertThresholdPercent),
    usageWidget: {
      collapsed: booleanOr(widget['collapsed'], defaults.usageWidget.collapsed),
      right: numberOr(widget['right'], defaults.usageWidget.right),
      bottom: numberOr(widget['bottom'], defaults.usageWidget.bottom),
    },
    folderPanel: {
      open: booleanOr(panel['open'], defaults.folderPanel.open),
    },
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
