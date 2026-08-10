import { describe, expect, it } from 'vitest';
import { readSourceFiles, stripComments } from './helpers/source';

/**
 * CLAUDE.md hard rule 3: conversation content never leaves the device. The only
 * external host permitted anywhere in the codebase is the payment provider's
 * license endpoint. This test fails the build if any other host appears.
 *
 * Keep this list minimal. Adding a host here is a product decision that touches
 * the CWS privacy form and the privacy policy, not a convenience.
 */
const ALLOWED_HOSTS = new Set([
  'claude.ai',
  // Payment provider (license validation only, key + instanceId). PRD §6.
  // Both listed while Dodo vs Lemon Squeezy is still open (PRD §12).
  'api.dodopayments.com',
  'api.lemonsqueezy.com',
]);

/** Hosts that are documentation-only and must never be fetched. */
const URL_PATTERN = /\bhttps?:\/\/([a-z0-9.-]+)/gi;

describe('network allowlist', () => {
  const files = readSourceFiles();

  it('scans a non-empty source tree', () => {
    // Guards against the guard silently passing because the walk found nothing.
    expect(files.length).toBeGreaterThan(0);
  });

  it('references no host outside the allowlist', () => {
    const violations: string[] = [];

    for (const file of files) {
      const code = stripComments(file.text);
      for (const [, host] of code.matchAll(URL_PATTERN)) {
        if (host && !ALLOWED_HOSTS.has(host.toLowerCase())) {
          violations.push(`${file.path}: ${host}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
