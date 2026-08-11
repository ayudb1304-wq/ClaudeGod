import { DODO_CHECKOUT_URL, hasCheckoutUrl } from './config';

/**
 * Hosted-checkout links for the contextual upgrade CTAs (FEATURES 7.1,
 * ARCHITECTURE §6 step 1).
 *
 * Each call site names itself, so the Dodo dashboard shows which gate actually
 * drives purchases. Without that, "add an upgrade prompt somewhere" is
 * guesswork forever.
 */

/** Where a CTA was shown. Kept as a closed union so tags stay comparable. */
export type UpgradeSource =
  | 'search-cap'
  | 'folder-limit'
  | 'prompt-limit'
  | 'bulk-export'
  | 'usage-alerts'
  | 'prompt-variables'
  | 'settings';

export function canUpgrade(): boolean {
  return hasCheckoutUrl();
}

/**
 * Returns null when no checkout URL is configured, so callers render plain text
 * rather than a link to nowhere.
 */
export function buildUpgradeUrl(source: UpgradeSource): string | null {
  if (!hasCheckoutUrl()) return null;

  try {
    const url = new URL(DODO_CHECKOUT_URL);
    // Set rather than append: re-tagging a link that already carries utm
    // parameters should replace them, not stack duplicates.
    url.searchParams.set('utm_source', 'extension');
    url.searchParams.set('utm_medium', 'upgrade-cta');
    url.searchParams.set('utm_campaign', source);
    return url.toString();
  } catch {
    // A malformed configured URL is a build mistake, not a user problem.
    return null;
  }
}

/** Opens checkout in a new tab. Used from the content script and popup. */
export function openUpgrade(source: UpgradeSource): void {
  const url = buildUpgradeUrl(source);
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
