import { z } from 'zod';
import { DODO_API_BASE } from '@/shared/config';

/**
 * License client (ARCHITECTURE §6, FEATURES 7.1).
 *
 * Behind a `LicenseProvider` interface so swapping merchant of record is a
 * config change rather than a rewrite. Dodo is the only implementation; Lemon
 * Squeezy is deliberately not stubbed until it is actually needed.
 *
 * Dodo's activate/validate/deactivate are public endpoints taking no auth. The
 * only data that ever leaves the device here is the license key the user typed
 * and a random instance id we generated. No conversation content, no account
 * identifiers, nothing derived from claude.ai (CLAUDE.md rule 3).
 */

export type ActivationFailure =
  | 'not-found'
  | 'cannot-activate'
  | 'limit-reached'
  | 'network'
  | 'server';

export class LicenseError extends Error {
  constructor(readonly reason: ActivationFailure) {
    super(reason);
    this.name = 'LicenseError';
  }
}

export interface ActivationResult {
  /** Dodo's activation instance id, needed for validate and deactivate. */
  instanceId: string;
  productId: string | null;
  customerEmail: string | null;
}

export interface LicenseProvider {
  activate(licenseKey: string, instanceName: string): Promise<ActivationResult>;
  validate(licenseKey: string, instanceId: string | null): Promise<boolean>;
  deactivate(licenseKey: string, instanceId: string): Promise<void>;
}

const ActivateResponseSchema = z
  .object({
    id: z.string(),
    product: z.object({ product_id: z.string().nullish() }).loose().optional(),
    customer: z.object({ email: z.string().nullish() }).loose().optional(),
  })
  .loose();

const ValidateResponseSchema = z.object({ valid: z.boolean() }).loose();

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 800;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function failureFor(status: number): ActivationFailure {
  if (status === 404) return 'not-found';
  if (status === 403) return 'cannot-activate';
  if (status === 422) return 'limit-reached';
  return 'server';
}

/**
 * POSTs to the license API with retry on 429/5xx.
 *
 * Dodo rate-limits unauthenticated traffic to 20 req/s and recommends
 * exponential backoff. We are nowhere near that, but a 429 during a weekly
 * revalidation storm must not look like an invalid licence to the user.
 */
async function post(path: string, body: Record<string, string>): Promise<unknown> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${DODO_API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      if (attempt === MAX_RETRIES) throw new LicenseError('network');
      await sleep(BASE_BACKOFF_MS * 2 ** attempt);
      continue;
    }

    if (response.ok) {
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new LicenseError('server');
      }
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : BASE_BACKOFF_MS * 2 ** attempt;
      await sleep(wait);
      continue;
    }

    throw new LicenseError(failureFor(response.status));
  }

  throw new LicenseError('network');
}

export const dodoProvider: LicenseProvider = {
  async activate(licenseKey, instanceName) {
    const raw = await post('/licenses/activate', {
      license_key: licenseKey,
      name: instanceName,
    });

    const parsed = ActivateResponseSchema.safeParse(raw);
    if (!parsed.success) throw new LicenseError('server');

    return {
      instanceId: parsed.data.id,
      productId: parsed.data.product?.product_id ?? null,
      customerEmail: parsed.data.customer?.email ?? null,
    };
  },

  async validate(licenseKey, instanceId) {
    const body: Record<string, string> = { license_key: licenseKey };
    if (instanceId) body['license_key_instance_id'] = instanceId;

    const raw = await post('/licenses/validate', body);
    const parsed = ValidateResponseSchema.safeParse(raw);

    // An unreadable response is not proof of an invalid licence. Treat it as a
    // transport problem so the caller enters grace rather than downgrading a
    // paying customer on a bad deploy.
    if (!parsed.success) throw new LicenseError('server');
    return parsed.data.valid;
  },

  async deactivate(licenseKey, instanceId) {
    await post('/licenses/deactivate', {
      license_key: licenseKey,
      license_key_instance_id: instanceId,
    });
  },
};

/** Stable per-install id. Dodo counts activations, so this must not churn. */
export function newInstanceId(): string {
  return crypto.randomUUID();
}
