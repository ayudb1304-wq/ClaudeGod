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
    // Onboarding (FEATURES 7.2) opens here in M5. Sync is opt-in on that screen,
    // so nothing may start indexing before the user consents.
  }
});

// Top-level (not just onInstalled): re-creating an existing alarm is a cheap
// no-op, and this survives the worker being killed and revived.
void chrome.alarms.create(USAGE_ALARM_NAME, { periodInMinutes: 1 });

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

  const decision = evaluateAlert({
    snapshot,
    thresholdPercent: clampAlertThreshold(settings.alertThresholdPercent),
    lastAlertedResetsAt: marker.lastAlertedResetsAt,
    now: new Date(),
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
});

export {};
