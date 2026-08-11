import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  DEFAULT_SETTINGS,
  clampThreshold,
  interpretShortcutKeydown,
  readSettings,
  updateSettings,
  updateUsageWidgetSettings,
  type Settings,
} from '@/shared/settings';
import { deleteAllLocalData } from '@/core/syncRunner';
import { strings } from '@/shared/strings';
import { UpgradeLink } from '@/shared/UpgradeLink';
import { getEntitlements, subscribeEntitlements } from '@/core/entitlements';

/**
 * Settings controls (FEATURES 8.1): shortcut, widget, alert threshold, and the
 * two data controls.
 *
 * Licence management is its own section. Everything here writes to
 * storage.sync, so changes reach an open claude.ai tab without a reload.
 */

const isMac = navigator.userAgent.includes('Mac');
const MOD_LABEL = isMac ? '⌘' : 'Ctrl';

function Row({ label, hint, children }: { label: string; hint?: string; children: preact.ComponentChildren }) {
  return (
    <div style={{ margin: '14px 0 0' }}>
      <label style={{ display: 'block', fontWeight: 500 }}>{label}</label>
      {hint && <p style={{ margin: '2px 0 4px', fontSize: 12, color: '#777' }}>{hint}</p>}
      {children}
    </div>
  );
}

export function SettingsSection() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureHint, setCaptureHint] = useState<string | null>(null);
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The threshold slider stays usable on free: the setting is remembered, it
  // simply has no effect until Pro. Disabling it would hide what they'd get.
  const [alertsEnabled, setAlertsEnabled] = useState(getEntitlements().usageAlerts);

  useEffect(() => subscribeEntitlements((value) => setAlertsEnabled(value.usageAlerts)), []);

  useEffect(() => {
    readSettings()
      .then(setSettings)
      .catch(() => setSettings(DEFAULT_SETTINGS));
  }, []);

  const patch = useCallback(async (next: Partial<Settings>): Promise<void> => {
    setSettings((current) => (current ? { ...current, ...next } : current));
    await updateSettings(next);
  }, []);

  /**
   * Listens on the window, not the button.
   *
   * A handler bound to the button only fires while that button holds focus,
   * which made rebinding silently do nothing the moment focus moved. Capture
   * phase also lets us preventDefault before the browser acts on combinations
   * like Ctrl+K, which otherwise jumps to the address bar.
   */
  useEffect(() => {
    if (!capturing) return;

    const onKey = (event: KeyboardEvent): void => {
      const result = interpretShortcutKeydown(event);
      if (result.kind === 'ignore') return;

      event.preventDefault();
      event.stopPropagation();

      if (result.kind === 'cancel') {
        setCapturing(false);
        setCaptureHint(null);
        return;
      }
      if (result.kind === 'invalid') {
        // Never fail silently: say what is wrong and keep listening.
        setCaptureHint(
          result.reason === 'needs-modifier'
            ? strings.settingsUi.shortcutNeedsModifier
            : strings.settingsUi.shortcutNeedsLetter,
        );
        return;
      }

      setCapturing(false);
      setCaptureHint(null);
      void patch({ searchShortcut: result.value }).catch(() => {
        setCaptureHint(strings.settingsUi.shortcutSaveFailed);
      });
    };

    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [capturing, patch]);

  const wipe = useCallback(async (): Promise<void> => {
    setNotice(null);
    try {
      await deleteAllLocalData();
      setConfirmingWipe(false);
      setNotice(strings.settingsUi.wipeDone);
      setSettings(DEFAULT_SETTINGS);
    } catch {
      setNotice(strings.settingsUi.wipeFailed);
    }
  }, []);

  if (!settings) {
    return <p style={{ color: '#777' }}>{strings.settingsUi.loading}</p>;
  }

  const { searchShortcut: shortcut, usageWidget: widget } = settings;
  const combo = `${MOD_LABEL}${shortcut.requireShift ? '+Shift' : ''}+${shortcut.key.toUpperCase()}`;

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>{strings.settingsUi.title}</h2>

      <Row label={strings.settingsUi.shortcut} hint={strings.settingsUi.shortcutHint}>
        <button
          type="button"
          onClick={() => {
            setCaptureHint(null);
            setCapturing((on) => !on);
          }}
          style={{ minWidth: 170, fontFamily: 'ui-monospace, monospace' }}
        >
          {capturing ? strings.settingsUi.shortcutCapturing : combo}
        </button>
        {capturing && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: captureHint ? '#a05a2c' : '#777' }}>
            {captureHint ?? strings.settingsUi.shortcutEscapeHint}
          </p>
        )}
        {!shortcut.requireShift && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#777' }}>
            {strings.settingsUi.shortcutComposerNote(`${MOD_LABEL}+Shift+${shortcut.key.toUpperCase()}`)}
          </p>
        )}
      </Row>

      <Row label={strings.settingsUi.widget}>
        <label style={{ display: 'block', fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={!widget.hidden}
            onChange={(event) => {
              void updateUsageWidgetSettings({
                hidden: !(event.target as HTMLInputElement).checked,
              });
              setSettings((c) =>
                c
                  ? {
                      ...c,
                      usageWidget: {
                        ...c.usageWidget,
                        hidden: !(event.target as HTMLInputElement).checked,
                      },
                    }
                  : c,
              );
            }}
          />{' '}
          {strings.settingsUi.widgetShow}
        </label>
        <button
          type="button"
          style={{ marginTop: 6 }}
          onClick={() => {
            void updateUsageWidgetSettings({
              right: DEFAULT_SETTINGS.usageWidget.right,
              bottom: DEFAULT_SETTINGS.usageWidget.bottom,
            });
            setNotice(strings.settingsUi.widgetReset);
          }}
        >
          {strings.settingsUi.widgetResetButton}
        </button>
      </Row>

      <Row label={strings.settingsUi.threshold(settings.alertThresholdPercent)}>
        {!alertsEnabled && (
          <p style={{ margin: '0 0 4px', fontSize: 12, color: '#777' }}>
            {strings.upgrade.alerts} <UpgradeLink source="usage-alerts" />
          </p>
        )}
        <input
          type="range"
          min={50}
          max={95}
          step={1}
          value={settings.alertThresholdPercent}
          style={{ width: '100%' }}
          onInput={(event) => {
            const value = clampThreshold(Number((event.target as HTMLInputElement).value));
            void patch({ alertThresholdPercent: value });
          }}
        />
      </Row>

      <Row label={strings.settingsUi.data}>
        <label style={{ display: 'block', fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={settings.syncPaused}
            onChange={(event) => {
              void patch({ syncPaused: (event.target as HTMLInputElement).checked });
            }}
          />{' '}
          {strings.settingsUi.pauseSync}
        </label>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#777' }}>
          {strings.settingsUi.pauseSyncHint}
        </p>

        {confirmingWipe ? (
          <div style={{ marginTop: 10 }}>
            {/* Destructive and irreversible, so it takes two deliberate clicks
                and states plainly what disappears. */}
            <p style={{ margin: '0 0 6px', fontSize: 12, color: '#a05a2c' }}>
              {strings.settingsUi.wipeConfirm}
            </p>
            <button type="button" onClick={() => void wipe()}>
              {strings.settingsUi.wipeConfirmButton}
            </button>{' '}
            <button
              type="button"
              onClick={() => {
                setConfirmingWipe(false);
              }}
            >
              {strings.settingsUi.cancel}
            </button>
          </div>
        ) : (
          <button
            type="button"
            style={{ marginTop: 10 }}
            onClick={() => {
              setConfirmingWipe(true);
            }}
          >
            {strings.settingsUi.wipe}
          </button>
        )}
      </Row>

      {notice && <p style={{ margin: '10px 0 0', fontSize: 12, color: '#2c6e49' }}>{notice}</p>}
    </section>
  );
}
