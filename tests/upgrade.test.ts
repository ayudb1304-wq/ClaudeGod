import { describe, expect, it } from 'vitest';
import { buildUpgradeUrl, canUpgrade } from '@/shared/upgrade';
import { DODO_CHECKOUT_URL, DODO_API_BASE } from '@/shared/config';
import { readSourceFiles, stripComments } from './helpers/source';

/**
 * Upgrade CTAs (FEATURES 7.1).
 *
 * The two failure modes worth guarding: a link that goes nowhere when checkout
 * is unconfigured, and a gate that reports a limit without offering the way
 * past it.
 */

const configured = DODO_CHECKOUT_URL.length > 0;

describe('buildUpgradeUrl', () => {
  it.runIf(configured)('tags the campaign with the gate that showed it', () => {
    const url = new URL(buildUpgradeUrl('folder-limit') ?? '');
    expect(url.searchParams.get('utm_source')).toBe('extension');
    expect(url.searchParams.get('utm_campaign')).toBe('folder-limit');
  });

  it.runIf(configured)('keeps the configured product path intact', () => {
    const built = new URL(buildUpgradeUrl('search-cap') ?? '');
    const base = new URL(DODO_CHECKOUT_URL);
    expect(built.origin).toBe(base.origin);
    expect(built.pathname).toBe(base.pathname);
  });

  it.runIf(configured)('does not stack duplicate utm params on repeated calls', () => {
    const once = new URL(buildUpgradeUrl('bulk-export') ?? '');
    expect(once.searchParams.getAll('utm_campaign')).toHaveLength(1);
  });

  it.runIf(!configured)('returns null when no checkout URL is configured', () => {
    expect(buildUpgradeUrl('search-cap')).toBeNull();
    expect(canUpgrade()).toBe(false);
  });
});

describe('CTA coverage', () => {
  /**
   * Every gate that can tell a user "no" should also tell them how to get past
   * it. A limit message with no adjacent CTA is a dead end.
   */
  const GATED_SURFACES = [
    'src/popup/Popup.tsx',
    'src/options/PromptLibrary.tsx',
    'src/options/SettingsSection.tsx',
    'src/content/ui/FolderPanel.tsx',
    'src/content/ui/SearchOverlay.tsx',
  ];

  const files = readSourceFiles();

  /** Either CTA component counts: the quiet inline link, or the louder card. */
  const CTA_COMPONENTS = ['UpgradeLink', 'UpgradeCallout'];

  it.each(GATED_SURFACES)('%s offers an upgrade path', (path) => {
    const file = files.find((candidate) => candidate.path === path);
    expect(file, `${path} not found`).toBeDefined();
    const code = stripComments(file?.text ?? '');
    expect(CTA_COMPONENTS.some((component) => code.includes(component))).toBe(true);
  });

  it.each(CTA_COMPONENTS)('%s never renders as a modal or interrupt', (component) => {
    // FEATURES 7.1: quiet, contextual, never interrupts typing.
    const cta = files.find((file) => file.path === `src/shared/${component}.tsx`);
    expect(cta, `${component}.tsx not found`).toBeDefined();
    const code = stripComments(cta?.text ?? '');
    expect(code).not.toMatch(/alert\(|confirm\(|showModal|position:\s*fixed/i);
  });

  /**
   * The louder card earns its prominence by being dismissible for good. If that
   * ever regresses it becomes the nag FEATURES 7.1 rules out, so it is asserted
   * rather than trusted.
   */
  it('lets the prominent CTA be dismissed permanently', () => {
    const code = stripComments(
      files.find((file) => file.path === 'src/shared/UpgradeCallout.tsx')?.text ?? '',
    );
    expect(code).toContain('dismissCta');
    expect(code).toMatch(/dismissedCtas/);
  });
});

describe('checkout host follows the environment', () => {
  /**
   * Regression: the checkout URL was configured as a full literal pointing at
   * the live host, so a test build linked to live checkout and every upgrade
   * click landed on error/not-found. Test and live use different checkout
   * hosts, which the docs only show for live.
   */
  it('uses a checkout host matching the configured API environment', () => {
    if (!DODO_CHECKOUT_URL) return;
    const checkoutHost = new URL(DODO_CHECKOUT_URL).host;
    const isTestApi = DODO_API_BASE.includes('test.');
    expect(checkoutHost.startsWith('test.')).toBe(isTestApi);
  });

  it('derives the link from a bare product id, never a stored URL', () => {
    const source = readSourceFiles().find((file) => file.path === 'src/shared/config.ts');
    const code = stripComments(source?.text ?? '');
    // A configurable full URL is what let the two disagree in the first place.
    expect(code).not.toContain('VITE_DODO_CHECKOUT_URL');
    expect(code).toContain('VITE_DODO_PRODUCT_ID');
  });
})
