import { describe, expect, it } from 'vitest';
import { buildUpgradeUrl, canUpgrade } from '@/shared/upgrade';
import { DODO_CHECKOUT_URL } from '@/shared/config';
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

  it.each(GATED_SURFACES)('%s offers an upgrade path', (path) => {
    const file = files.find((candidate) => candidate.path === path);
    expect(file, `${path} not found`).toBeDefined();
    expect(stripComments(file?.text ?? '')).toContain('UpgradeLink');
  });

  it('never renders the CTA as a modal or interrupt', () => {
    // FEATURES 7.1: quiet, contextual, never interrupts typing.
    const cta = files.find((file) => file.path === 'src/shared/UpgradeLink.tsx');
    const code = stripComments(cta?.text ?? '');
    expect(code).not.toMatch(/alert\(|confirm\(|showModal|position:\s*fixed/i);
  });
});
