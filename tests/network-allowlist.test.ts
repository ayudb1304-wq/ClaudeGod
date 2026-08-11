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
  // Dodo Payments license API (PRD §6). Sends a license key and an instance id,
  // never anything derived from a conversation. Both environments are listed
  // because the build picks one; only one is ever reachable at runtime.
  // These are the real hosts: there is no api.dodopayments.com.
  'test.dodopayments.com',
  'live.dodopayments.com',
  // Hosted checkout. Opened in a tab, never fetched, so no data leaves here.
  'checkout.dodopayments.com',
  'test.checkout.dodopayments.com',
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
