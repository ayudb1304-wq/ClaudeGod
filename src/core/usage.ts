import type { Organization, Usage } from '@/api/types';
import { getLocal, setLocal } from '@/shared/storage';

/**
 * Usage meter core (FEATURES 3.1/3.2, ARCHITECTURE §5).
 *
 * The M0 spike found an authoritative `/usage` endpoint, so there is no
 * estimation tier here: `utilization` is displayed as read, and when the
 * endpoint fails the meter goes away behind a calm message. We never guess a
 * number (api-notes §5).
 *
 * Split across contexts:
 *   - content script: polls via the adapter (it owns the same-origin session),
 *     feeds the widget through the store below, caches a snapshot for others.
 *   - service worker: reads the cached snapshot on an alarm tick and decides
 *     whether to notify (evaluateAlert). It never fetches claude.ai itself.
 *   - popup: reads the cached snapshot, display only.
 */

export interface UsageWindowSnapshot {
  /** 0–100, straight from the API (clamped defensively). */
  utilization: number;
  resetsAt: string | null;
}

export interface UsageSnapshot {
  fiveHour: UsageWindowSnapshot | null;
  sevenDay: UsageWindowSnapshot | null;
  /** When we fetched it, ISO. Staleness gate for alerts and popup honesty. */
  fetchedAt: string;
}

export type UsageMeterState =
  | { kind: 'loading' }
  | { kind: 'ok'; snapshot: UsageSnapshot }
  | { kind: 'unavailable' };

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeWindow(window: Usage['five_hour']): UsageWindowSnapshot | null {
  const utilization = window?.utilization;
  if (typeof utilization !== 'number' || !Number.isFinite(utilization)) return null;
  return {
    utilization: Math.min(100, Math.max(0, Math.round(utilization))),
    resetsAt: typeof window?.resets_at === 'string' ? window.resets_at : null,
  };
}

/**
 * Null when neither window carries a usable number — that is the degraded
 * signal callers act on. A single missing window degrades to showing the other.
 */
export function normalizeUsage(usage: Usage | null, now: Date): UsageSnapshot | null {
  if (!usage) return null;
  const fiveHour = normalizeWindow(usage.five_hour);
  const sevenDay = normalizeWindow(usage.seven_day);
  if (!fiveHour && !sevenDay) return null;
  return { fiveHour, sevenDay, fetchedAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// Store (module-level subscribe pattern, same shape as shared/syncStatus)
// ---------------------------------------------------------------------------

let state: UsageMeterState = { kind: 'loading' };
const listeners = new Set<(state: UsageMeterState) => void>();

export function getUsageState(): UsageMeterState {
  return state;
}

export function subscribeUsage(listener: (state: UsageMeterState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function emit(next: UsageMeterState): void {
  state = next;
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      /* UI listeners are best-effort */
    }
  }
}

export function resetUsageStateForTests(): void {
  state = { kind: 'loading' };
  listeners.clear();
  cachedOrgId = null;
}

// ---------------------------------------------------------------------------
// Refresh (content script only — the adapter needs the page's session)
// ---------------------------------------------------------------------------

/** The adapter surface usage needs. Injected so tests need no network. */
export interface UsageAdapter {
  getChatOrganization(): Promise<Organization | null>;
  getUsage(orgId: string): Promise<Usage | null>;
}

let cachedOrgId: string | null = null;

export async function refreshUsage(adapter: UsageAdapter, now = new Date()): Promise<void> {
  try {
    if (!cachedOrgId) {
      cachedOrgId = (await adapter.getChatOrganization())?.uuid ?? null;
    }
    if (!cachedOrgId) {
      emit({ kind: 'unavailable' });
      return;
    }

    const snapshot = normalizeUsage(await adapter.getUsage(cachedOrgId), now);
    if (!snapshot) {
      emit({ kind: 'unavailable' });
      return;
    }

    emit({ kind: 'ok', snapshot });
    // Numbers and timestamps only — metadata, so chrome.storage is allowed.
    await setLocal('usageCache', snapshot);
  } catch {
    // Adapter exhausted retries or the org lookup failed. The last cached
    // snapshot stays put (it is honestly dated); the live meter hides.
    emit({ kind: 'unavailable' });
  }
}

const POLL_INTERVAL_MS = 60_000;

/**
 * Polls while the tab is open, skipping hidden tabs so N background tabs do not
 * multiply requests. One poll per minute per visible tab is far inside the
 * adapter's 1 req/sec throttle.
 */
export function startUsagePolling(
  adapter: UsageAdapter,
  intervalMs = POLL_INTERVAL_MS,
): () => void {
  void refreshUsage(adapter);
  const timer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    void refreshUsage(adapter);
  }, intervalMs);
  return () => clearInterval(timer);
}

// ---------------------------------------------------------------------------
// Cached snapshot (read side for popup and service worker)
// ---------------------------------------------------------------------------

function narrowWindow(value: unknown): UsageWindowSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record['utilization'] !== 'number') return null;
  return {
    utilization: record['utilization'],
    resetsAt: typeof record['resetsAt'] === 'string' ? record['resetsAt'] : null,
  };
}

export async function readCachedUsage(): Promise<UsageSnapshot | null> {
  try {
    const raw = await getLocal<unknown>('usageCache');
    if (typeof raw !== 'object' || raw === null) return null;
    const record = raw as Record<string, unknown>;
    if (typeof record['fetchedAt'] !== 'string') return null;
    const fiveHour = narrowWindow(record['fiveHour']);
    const sevenDay = narrowWindow(record['sevenDay']);
    if (!fiveHour && !sevenDay) return null;
    return { fiveHour, sevenDay, fetchedAt: record['fetchedAt'] };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Alerts (pure logic; the service worker supplies state and side effects)
// ---------------------------------------------------------------------------

export const USAGE_ALARM_NAME = 'usage-check';
export const DEFAULT_ALERT_THRESHOLD = 80;

/** FEATURES 3.2: configurable 50–95. Junk input lands on the default. */
export function clampAlertThreshold(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ALERT_THRESHOLD;
  return Math.min(95, Math.max(50, Math.round(value)));
}

/**
 * A snapshot older than this cannot justify a notification: the user may have
 * closed claude.ai long ago and the number is history, not state.
 */
export const ALERT_STALE_AFTER_MS = 10 * 60_000;

/** Old enough that the figure is worth a caveat, not old enough to hide. */
export const DISPLAY_AGING_AFTER_MS = 5 * 60_000;
export const DISPLAY_STALE_AFTER_MS = 30 * 60_000;

/**
 * How much to trust a cached snapshot right now.
 *
 * Usage is only polled while a claude.ai tab is open, because the frozen
 * permission set gives the service worker no session of its own. So the popup
 * can be looking at a figure from hours ago, and "82%" with no caveat is a
 * confident lie.
 *
 * `expired` is the important one. `resetsAt` is when the 5-hour window rolls
 * over, so once that moment has passed the stored utilization describes a
 * window that no longer exists: the real figure is near zero. Showing the old
 * number then is worse than showing nothing.
 */
export type UsageFreshness = 'fresh' | 'aging' | 'stale' | 'expired';

export function classifyUsageFreshness(
  snapshot: UsageSnapshot | null,
  now: Date,
): UsageFreshness {
  if (!snapshot) return 'expired';

  const resetsAt = snapshot.fiveHour?.resetsAt;
  if (resetsAt) {
    const resets = Date.parse(resetsAt);
    if (Number.isFinite(resets) && resets <= now.getTime()) return 'expired';
  }

  const fetchedAt = Date.parse(snapshot.fetchedAt);
  // An unparseable timestamp cannot be vouched for, so treat it as the worst
  // case rather than silently presenting it as current.
  if (!Number.isFinite(fetchedAt)) return 'expired';

  const age = now.getTime() - fetchedAt;
  if (age >= DISPLAY_STALE_AFTER_MS) return 'stale';
  if (age >= DISPLAY_AGING_AFTER_MS) return 'aging';
  return 'fresh';
}

export interface AlertInput {
  snapshot: UsageSnapshot | null;
  thresholdPercent: number;
  /** resets_at of the last fired alert; the once-per-window key (ARCH §5). */
  lastAlertedResetsAt: string | null;
  now: Date;
  /**
   * FEATURES 3.2 makes limit alerts Pro-only. Gated here rather than at the
   * call site so the rule sits with the rest of the tested alert logic, and so
   * a second caller cannot forget it.
   *
   * The meter itself stays free (FEATURES 3.1); only the notification is paid.
   */
  alertsEnabled: boolean;
}

export interface AlertDecision {
  fire: boolean;
  /** Set when fire is true. */
  resetsAt?: string;
  utilization?: number;
}

/**
 * Once-per-window is keyed on `resets_at` rather than time math, so it is exact
 * even across service-worker restarts. No `resets_at` means no dedupe key, and
 * a possibly-repeating notification is worse than a missing one — skip.
 */
export function evaluateAlert(input: AlertInput): AlertDecision {
  const { snapshot, now } = input;
  if (!input.alertsEnabled) return { fire: false };

  const window = snapshot?.fiveHour;
  if (!snapshot || !window?.resetsAt) return { fire: false };

  const fetchedAt = Date.parse(snapshot.fetchedAt);
  if (!Number.isFinite(fetchedAt) || now.getTime() - fetchedAt > ALERT_STALE_AFTER_MS) {
    return { fire: false };
  }

  if (window.utilization < clampAlertThreshold(input.thresholdPercent)) return { fire: false };
  if (window.resetsAt === input.lastAlertedResetsAt) return { fire: false };

  return { fire: true, resetsAt: window.resetsAt, utilization: window.utilization };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "2h 05m", "45m", or "under a minute". Fed by widget countdown and popup age. */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return 'under a minute';
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${String(minutes)}m`;
  return `${String(hours)}h ${String(minutes).padStart(2, '0')}m`;
}

/** Null when resetsAt is absent, unparseable, or already in the past. */
export function formatTimeUntil(resetsAt: string | null, now: Date): string | null {
  if (!resetsAt) return null;
  const target = Date.parse(resetsAt);
  if (!Number.isFinite(target) || target <= now.getTime()) return null;
  return formatDuration(target - now.getTime());
}
