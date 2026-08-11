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
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>{strings.license.title}</h2>

      {isActive && state?.record ? (
        <>
          <p style={{ margin: 0, color: '#2c6e49' }}>
            {status === 'grace' ? strings.license.activeGrace : strings.license.active}
          </p>
          {state.record.customerEmail && (
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#777' }}>
              {state.record.customerEmail}
            </p>
          )}
          <button
            type="button"
            style={{ marginTop: 10 }}
            disabled={busy}
            onClick={() => void remove()}
          >
            {strings.license.remove}
          </button>
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 8px', color: '#555' }}>
            {status === 'expired' ? strings.license.expired : strings.license.freeExplainer}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={key}
              placeholder={strings.license.placeholder}
              aria-label={strings.license.placeholder}
              spellcheck={false}
              style={{ flex: 1, padding: '6px 8px', font: 'inherit' }}
              onInput={(event) => {
                setKey((event.target as HTMLInputElement).value);
              }}
            />
            <button type="button" disabled={busy || key.trim().length === 0} onClick={() => void activate()}>
              {busy ? strings.license.activating : strings.license.activate}
            </button>
          </div>
          {hasCheckoutUrl() && (
            // Quiet contextual CTA, never a modal (FEATURES 7.1).
            <p style={{ margin: '10px 0 0', fontSize: 12 }}>
              <a href={DODO_CHECKOUT_URL} target="_blank" rel="noreferrer">
                {strings.license.buyLink}
              </a>
            </p>
          )}
        </>
      )}

      {problem && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#a05a2c' }}>{problem}</p>}
    </section>
  );
}
