/**
 * Build-time payment configuration (ARCHITECTURE §9).
 *
 * NO SECRETS LIVE HERE, AND NONE MAY EVER BE ADDED.
 *
 * Dodo's activate/validate/deactivate endpoints are public and take no
 * authentication, which is precisely why a client-side extension can use them.
 * A Dodo API key is for server-side admin calls (listing keys, changing limits)
 * that this extension never makes. Anything bundled into a CRX is readable by
 * anyone who downloads it, so a secret here would be a published secret.
 *
 * Everything below is public information: base URLs and a checkout link.
 */

export type DodoEnvironment = 'test' | 'live';

function readEnvironment(): DodoEnvironment {
  // Defaults to live: a shipped build that silently pointed at test mode would
  // reject every real customer's key. Development opts in explicitly.
  return import.meta.env.VITE_DODO_ENV === 'test' ? 'test' : 'live';
}

export const DODO_ENVIRONMENT: DodoEnvironment = readEnvironment();

const API_BASE: Record<DodoEnvironment, string> = {
  test: 'https://test.dodopayments.com',
  live: 'https://live.dodopayments.com',
};

export const DODO_API_BASE = API_BASE[DODO_ENVIRONMENT];

/**
 * Hosted checkout, opened in a new tab on upgrade (ARCHITECTURE §6 step 1).
 *
 * Left empty until the product exists; the UI hides the upgrade button rather
 * than linking somewhere broken.
 */
export const DODO_CHECKOUT_URL: string = import.meta.env.VITE_DODO_CHECKOUT_URL ?? '';

export function hasCheckoutUrl(): boolean {
  return DODO_CHECKOUT_URL.length > 0;
}

/**
 * One-question uninstall form (FEATURES 7.2).
 *
 * Empty until the landing domain exists. Carries no identifiers: Chrome appends
 * nothing, and we append nothing, so this is a bare URL open on uninstall.
 */
export const UNINSTALL_FEEDBACK_URL: string = import.meta.env.VITE_UNINSTALL_URL ?? '';
