import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  activateLicense,
  applyStoredLicense,
  removeLicense,
  type LicenseState,
} from '@/core/licenseState';
import type { ActivationFailure } from '@/core/license';
import { DODO_CHECKOUT_URL, hasCheckoutUrl } from '@/shared/config';
import { strings } from '@/shared/strings';

/**
 * License management (FEATURES 7.1, 8.1).
 *
 * Error copy is specific per failure so a customer knows whether to retry, check
 * the key, or free a seat. "Something went wrong" would send every one of these
 * to support.
 */

function failureMessage(reason: ActivationFailure): string {
  switch (reason) {
    case 'not-found':
      return strings.license.errorNotFound;
    case 'cannot-activate':
      return strings.license.errorCannotActivate;
    case 'limit-reached':
      return strings.license.errorLimitReached;
    case 'network':
      return strings.license.errorNetwork;
    default:
      return strings.license.errorServer;
  }
}

/** Names the activation so a customer can tell their devices apart in Dodo. */
function instanceName(): string {
  const platform = navigator.userAgent.includes('Mac')
    ? 'Mac'
    : navigator.userAgent.includes('Windows')
      ? 'Windows'
      : 'Linux';
  return `Chrome on ${platform}`;
}

export function LicenseSection() {
  const [state, setState] = useState<LicenseState | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    applyStoredLicense()
      .then(setState)
      .catch(() => setState({ status: 'none', record: null }));
  }, []);

  const activate = useCallback(async (): Promise<void> => {
    setBusy(true);
    setProblem(null);
    try {
      const outcome = await activateLicense(key, instanceName());
      setState(outcome.state);
      if (outcome.error) setProblem(failureMessage(outcome.error.reason));
      else setKey('');
    } finally {
      setBusy(false);
    }
  }, [key]);

  const remove = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      await removeLicense();
      setState({ status: 'none', record: null });
      setProblem(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const status = state?.status ?? 'none';
  const isActive = status === 'active' || status === 'grace';

  return (
    <section class="cg-card">
      <h2 class="cg-card-title">{strings.license.title}</h2>

      {isActive && state?.record ? (
        <>
          <p class="cg-notice" data-tone="ok">
            {status === 'grace' ? strings.license.activeGrace : strings.license.active}
          </p>
          {state.record.customerEmail && (
            <p class="cg-hint">
              {state.record.customerEmail}
            </p>
          )}
          <button type="button" class="cg-btn"
            disabled={busy}
            onClick={() => void remove()}
          >
            {strings.license.remove}
          </button>
        </>
      ) : (
        <>
          <p class="cg-card-lede">
            {status === 'expired' ? strings.license.expired : strings.license.freeExplainer}
          </p>
          <div class="cg-actions">
            <input type="text" class="cg-text-input"
              value={key}
              placeholder={strings.license.placeholder}
              aria-label={strings.license.placeholder}
              spellcheck={false}
              style={{ flex: 1 }}
              onInput={(event) => {
                setKey((event.target as HTMLInputElement).value);
              }}
            />
            <button
              type="button"
              class="cg-btn cg-btn-primary"
              disabled={busy || key.trim().length === 0}
              onClick={() => void activate()}
            >
              {busy ? strings.license.activating : strings.license.activate}
            </button>
          </div>
          {hasCheckoutUrl() && (
            // Quiet contextual CTA, never a modal (FEATURES 7.1).
            <p class="cg-hint">
              <a href={DODO_CHECKOUT_URL} target="_blank" rel="noreferrer">
                {strings.license.buyLink}
              </a>
            </p>
          )}
        </>
      )}

      {problem && <p class="cg-notice" data-tone="warn">{problem}</p>}
    </section>
  );
}
