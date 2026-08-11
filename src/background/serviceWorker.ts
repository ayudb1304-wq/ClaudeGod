import {
  clampAlertThreshold,
  evaluateAlert,
  formatTimeUntil,
  readCachedUsage,
  USAGE_ALARM_NAME,
} from '@/core/usage';
import { readSettings } from '@/shared/settings';
import { getLocal, setLocal } from '@/shared/storage';
import { strings } from '@/shared/strings';
import { UNINSTALL_FEEDBACK_URL } from '@/shared/config';
import { getEntitlements } from '@/core/entitlements';
import {
  applyStoredLicense,
  needsRevalidation,
  readLicenseRecord,
  revalidateLicense,
} from '@/core/licenseState';

/** Hourly tick; the 7-day due-date check lives in licenseState. */
export const LICENSE_ALARM_NAME = 'claudegod-license-revalidate';

/**
 * MV3 service worker.
 *
 * Owns: alarms (usage check; later license revalidation), notifications.
 * Does NOT own: claude.ai network access. That belongs to the content script
 * via api/claudeAdapter.ts, which needs the page's same-origin session. This
 * worker only reads the usage snapshot the content script cached (metadata:
 * two percentages and timestamps) and decides whether to notify.
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Opens the settings page so the first-run explainer and the "Start
    // indexing" consent are the first thing a user sees. Nothing has been read
    // from their account at this point (FEATURES 7.2).
    void chrome.runtime.openOptionsPage();
  }
});

// One question, no identifiers (FEATURES 7.2). Guarded because an invalid or
// unset URL throws, and a failure here must never break install.
if (UNINSTALL_FEEDBACK_URL.length > 0) {
  try {
    void chrome.runtime.setUninstallURL(UNINSTALL_FEEDBACK_URL);
  } catch {
    /* non-fatal */
  }
}

// Top-level (not just onInstalled): re-creating an existing alarm is a cheap
// no-op, and this survives the worker being killed and revived.
void chrome.alarms.create(USAGE_ALARM_NAME, { periodInMinutes: 1 });
// Checked hourly, but revalidateLicense only calls out when the record is older
// than 7 days. The frequent tick exists so a worker that was asleep on the due
// date catches up promptly instead of waiting another week.
void chrome.alarms.create(LICENSE_ALARM_NAME, { periodInMinutes: 60 });

/**
 * ARCHITECTURE §6 step 5. Deliberately quiet: a licence that revalidates fine
 * produces no user-visible event, and a network failure produces none either
 * because the 14-day grace absorbs it.
 */
async function checkLicense(): Promise<void> {
  const record = await readLicenseRecord();
  if (!record) return;
  if (!needsRevalidation(record, new Date())) {
    await applyStoredLicense();
    return;
  }
  await revalidateLicense();
}

interface UsageAlertMarker {
  lastAlertedResetsAt: string | null;
}

async function readAlertMarker(): Promise<UsageAlertMarker> {
  const raw = await getLocal<unknown>('usageAlert');
  if (typeof raw === 'object' && raw !== null) {
    const value = (raw as Record<string, unknown>)['lastAlertedResetsAt'];
    if (typeof value === 'string') return { lastAlertedResetsAt: value };
  }
  return { lastAlertedResetsAt: null };
}

/**
 * FEATURES 3.2: at most one notification per 5-hour window, at a configurable
 * threshold. All decision logic lives in core/usage.ts where it is unit-tested;
 * this function only supplies stored state and performs the side effects.
 */
async function checkUsageAlert(): Promise<void> {
  const [snapshot, settings, marker] = await Promise.all([
    readCachedUsage(),
    readSettings(),
    readAlertMarker(),
  ]);

  // Entitlements are per-context memory and this worker is killed and revived
  // constantly, so the licence must be re-read before the gate is consulted.
  await applyStoredLicense();

  const decision = evaluateAlert({
    snapshot,
    thresholdPercent: clampAlertThreshold(settings.alertThresholdPercent),
    lastAlertedResetsAt: marker.lastAlertedResetsAt,
    now: new Date(),
    alertsEnabled: getEntitlements().usageAlerts,
  });
  if (!decision.fire || !decision.resetsAt || decision.utilization === undefined) return;

  // Marker first: a duplicate notification is worse than a missed one if
  // notifications.create throws after the marker write fails.
  await setLocal('usageAlert', {
    lastAlertedResetsAt: decision.resetsAt,
  } satisfies UsageAlertMarker);

  const reset = formatTimeUntil(decision.resetsAt, new Date());
  // Notification id doubles as an OS-level dedupe key for the window.
  void chrome.notifications.create(`usage-${decision.resetsAt}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: strings.usage.alertTitle(decision.utilization),
    message: strings.usage.alertMessage(decision.utilization, reset),
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === USAGE_ALARM_NAME) {
    checkUsageAlert().catch(() => {
      // Storage hiccups on a background tick are not user-visible events.
    });
  }
  if (alarm.name === LICENSE_ALARM_NAME) {
    checkLicense().catch(() => {
      // Never downgrade because a background tick threw. The grace window is
      // the only thing allowed to expire a licence without a server refusal.
    });
  }
});

// The worker is revived for every alarm and message, so entitlements must be
// rehydrated from storage each time rather than assumed to survive.
void applyStoredLicense();

export {};
