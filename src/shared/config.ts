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
 * Hosted checkout host, per environment.
 *
 * Test and live use DIFFERENT checkout hosts, which is easy to miss because the
 * docs show only the live one. Pointing a test build at the live host returns
 * "error/not-found" for a product that exists perfectly well in test.
 */
const CHECKOUT_BASE: Record<DodoEnvironment, string> = {
  test: 'https://test.checkout.dodopayments.com',
  live: 'https://checkout.dodopayments.com',
};

/**
 * The product to sell. Configured as a bare id, not a full URL, so the checkout
 * host is always derived from DODO_ENVIRONMENT and the two cannot disagree.
 * Storing a whole URL let a test build carry a live checkout link.
 */
export const DODO_PRODUCT_ID: string = import.meta.env.VITE_DODO_PRODUCT_ID ?? '';

/**
 * Hosted checkout, opened in a new tab on upgrade (ARCHITECTURE §6 step 1).
 * Empty until a product is configured; the UI hides the CTA rather than
 * linking somewhere broken.
 */
export const DODO_CHECKOUT_URL: string =
  DODO_PRODUCT_ID.length > 0 ? `${CHECKOUT_BASE[DODO_ENVIRONMENT]}/buy/${DODO_PRODUCT_ID}` : '';

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
