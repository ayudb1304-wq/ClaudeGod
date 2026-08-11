import { getLocal, getSync, setLocal, setSync, subscribeLocalChanges } from '@/shared/storage';
import { setPro } from './entitlements';
import { LicenseError, dodoProvider, newInstanceId, type LicenseProvider } from './license';

/**
 * License lifecycle: activation record, weekly revalidation, 14-day offline
 * grace, and downgrade (ARCHITECTURE §6 steps 3-5).
 *
 * The decision logic here is pure and unit-tested. Only `applyStoredLicense`
 * and the activate/remove helpers touch storage or the network, because the
 * interesting failure modes are all in the date arithmetic.
 */

export const REVALIDATE_AFTER_DAYS = 7;
export const GRACE_PERIOD_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LicenseRecord {
  key: string;
  instanceId: string;
  activatedAt: string;
  /** Last time the server confirmed the key. Grace counts from here. */
  lastValidatedAt: string;
  productId: string | null;
  customerEmail: string | null;
}

/**
 * `grace` still grants Pro: we could not reach Dodo, which is our problem, not
 * the customer's. `revoked` does not: the server explicitly said no.
 */
export type LicenseStatus = 'none' | 'active' | 'grace' | 'expired' | 'revoked';

export interface LicenseState {
  status: LicenseStatus;
  record: LicenseRecord | null;
}

export function isProStatus(status: LicenseStatus): boolean {
  return status === 'active' || status === 'grace';
}

function daysBetween(from: string, now: Date): number {
  const parsed = Date.parse(from);
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - parsed) / DAY_MS;
}

/** Derives status from a stored record, with no network call. */
export function deriveStatus(record: LicenseRecord | null, now: Date): LicenseStatus {
  if (!record) return 'none';
  const age = daysBetween(record.lastValidatedAt, now);
  if (age <= REVALIDATE_AFTER_DAYS) return 'active';
  if (age <= GRACE_PERIOD_DAYS) return 'grace';
  return 'expired';
}

export function needsRevalidation(record: LicenseRecord | null, now: Date): boolean {
  if (!record) return false;
  return daysBetween(record.lastValidatedAt, now) > REVALIDATE_AFTER_DAYS;
}

function parseRecord(raw: unknown): LicenseRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const { key, instanceId, activatedAt, lastValidatedAt } = value;
  if (
    typeof key !== 'string' ||
    typeof instanceId !== 'string' ||
    typeof activatedAt !== 'string' ||
    typeof lastValidatedAt !== 'string'
  ) {
    return null;
  }
  return {
    key,
    instanceId,
    activatedAt,
    lastValidatedAt,
    productId: typeof value['productId'] === 'string' ? value['productId'] : null,
    customerEmail: typeof value['customerEmail'] === 'string' ? value['customerEmail'] : null,
  };
}

export async function readLicenseRecord(): Promise<LicenseRecord | null> {
  return parseRecord(await getLocal<unknown>('licenseCache'));
}

async function writeLicenseRecord(record: LicenseRecord | null): Promise<void> {
  await setLocal('licenseCache', record);
}

/** Reads storage, derives status, and pushes the result into entitlements. */
export async function applyStoredLicense(now = new Date()): Promise<LicenseState> {
  const record = await readLicenseRecord();
  const status = deriveStatus(record, now);
  setPro(isProStatus(status));
  return { status, record };
}

/**
 * Hydrates entitlements in this context and keeps them current.
 *
 * MUST be called from every context that reads entitlements. `entitlements.ts`
 * is module-level memory, so the popup, the content script, the options page
 * and the service worker each hold a separate copy that defaults to free.
 * Without this, activating a licence in settings leaves every other surface
 * still gated, which is exactly the bug this fixes.
 *
 * The storage listener matters as much as the initial read: the popup is often
 * already open when a licence is activated or removed elsewhere.
 */
export function initEntitlements(): () => void {
  void applyStoredLicense();

  return subscribeLocalChanges((keys) => {
    if (keys.includes('licenseCache')) void applyStoredLicense();
  });
}

export interface ActivateOutcome {
  state: LicenseState;
  error: LicenseError | null;
}

/**
 * The activation instance shared across this user's Chrome profiles.
 *
 * Lives in storage.sync so a reinstall or a second profile reuses the existing
 * seat instead of consuming another one. Returns null when nothing is stored,
 * or when the user is not signed into Chrome and sync is unavailable.
 */
async function readSharedInstanceId(): Promise<string | null> {
  try {
    const stored = await getSync<unknown>('licenseInstance');
    return typeof stored === 'string' && stored.length > 0 ? stored : null;
  } catch {
    return null;
  }
}

async function writeSharedInstanceId(instanceId: string): Promise<void> {
  try {
    await setSync('licenseInstance', instanceId);
  } catch {
    // Sync quota or a signed-out profile. The local record still works; this
    // device just falls back to holding its own seat.
  }
}

/**
 * Activates a key and stores the resulting instance.
 *
 * The instance id is generated per install and reused, because Dodo counts
 * activations against the key's limit; minting a new one on every attempt would
 * exhaust a customer's seats.
 */
export async function activateLicense(
  licenseKey: string,
  instanceName: string,
  provider: LicenseProvider = dodoProvider,
  now = new Date(),
): Promise<ActivateOutcome> {
  const trimmed = licenseKey.trim();
  if (trimmed.length === 0) {
    return { state: { status: 'none', record: null }, error: new LicenseError('not-found') };
  }

  try {
    /*
     * Reuse before activate. If this user already holds a seat (another Chrome
     * profile, or this one before a reinstall), validating against it proves
     * the licence without consuming a second activation. Only when there is no
     * usable seat do we spend one.
     *
     * This is what keeps a five-seat key from being exhausted by one person's
     * ordinary churn.
     */
    const sharedInstanceId = await readSharedInstanceId();
    if (sharedInstanceId) {
      const stillValid = await provider.validate(trimmed, sharedInstanceId).catch(() => false);
      if (stillValid) {
        const reused: LicenseRecord = {
          key: trimmed,
          instanceId: sharedInstanceId,
          activatedAt: now.toISOString(),
          lastValidatedAt: now.toISOString(),
          productId: null,
          customerEmail: null,
        };
        await writeLicenseRecord(reused);
        setPro(true);
        return { state: { status: 'active', record: reused }, error: null };
      }
    }

    const result = await provider.activate(trimmed, instanceName);
    const record: LicenseRecord = {
      key: trimmed,
      instanceId: result.instanceId,
      activatedAt: now.toISOString(),
      lastValidatedAt: now.toISOString(),
      productId: result.productId,
      customerEmail: result.customerEmail,
    };
    await writeLicenseRecord(record);
    await writeSharedInstanceId(result.instanceId);
    setPro(true);
    return { state: { status: 'active', record }, error: null };
  } catch (error) {
    const failure = error instanceof LicenseError ? error : new LicenseError('server');
    return { state: await applyStoredLicense(now), error: failure };
  }
}

/**
 * Weekly revalidation.
 *
 * The asymmetry is the whole point: an explicit `valid: false` revokes at once
 * (refund or chargeback), while an unreachable server leaves the record intact
 * so the customer keeps Pro until the 14-day grace expires.
 */
export async function revalidateLicense(
  provider: LicenseProvider = dodoProvider,
  now = new Date(),
): Promise<LicenseState> {
  const record = await readLicenseRecord();
  if (!record) {
    setPro(false);
    return { status: 'none', record: null };
  }

  let valid: boolean;
  try {
    valid = await provider.validate(record.key, record.instanceId);
  } catch {
    // Network or server trouble. Fall back to whatever the dates say.
    return applyStoredLicense(now);
  }

  if (!valid) {
    await writeLicenseRecord(null);
    setPro(false);
    return { status: 'revoked', record: null };
  }

  const refreshed: LicenseRecord = { ...record, lastValidatedAt: now.toISOString() };
  await writeLicenseRecord(refreshed);
  setPro(true);
  return { status: 'active', record: refreshed };
}

/** Settings → remove licence. Frees the activation seat when possible. */
export async function removeLicense(provider: LicenseProvider = dodoProvider): Promise<void> {
  const record = await readLicenseRecord();
  if (record) {
    try {
      await provider.deactivate(record.key, record.instanceId);
    } catch {
      // Best effort. A seat the server still counts is better than refusing to
      // let the user disconnect their own machine.
    }
  }
  await writeLicenseRecord(null);
  // Clear the shared instance too: the seat has been released, so a later
  // activation must claim a fresh one rather than validate against a dead id.
  try {
    await setSync('licenseInstance', null);
  } catch {
    /* best effort */
  }
  setPro(false);
}

export { newInstanceId };
