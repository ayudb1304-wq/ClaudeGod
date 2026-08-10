import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSourceFiles, stripComments, SRC_ROOT } from './helpers/source';

/**
 * CLAUDE.md hard rules 1 and 2:
 *   1. Read-only against claude.ai. No POST/PUT/PATCH/DELETE, ever.
 *   2. All claude.ai HTTP access lives in src/api/claudeAdapter.ts.
 *
 * These two are the whole ToS position (PRD §11 risk 4). If either regresses,
 * the build must stop.
 */

const ADAPTER_PATH = 'src/api/claudeAdapter.ts';
const MUTATING_VERBS = ['POST', 'PUT', 'PATCH', 'DELETE'];

describe('read-only guard', () => {
  const adapterCode = stripComments(readFileSync(join(SRC_ROOT, 'api/claudeAdapter.ts'), 'utf8'));

  it.each(MUTATING_VERBS)('adapter contains no %s request', (verb) => {
    // Matches method: 'POST', method:"POST", and bare quoted verbs passed around.
    const pattern = new RegExp(`['"\`]${verb}['"\`]`, 'i');
    expect(pattern.test(adapterCode)).toBe(false);
  });

  it('adapter exposes only read operations', () => {
    const exported = [...adapterCode.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(
      (match) => match[1],
    );

    expect(exported.length).toBeGreaterThan(0);
    for (const name of exported) {
      expect(name).toMatch(/^(list|get|fetch|read|self)/i);
    }
  });

  it('no module outside the adapter builds a claude.ai URL', () => {
    const violations = readSourceFiles()
      .filter((file) => file.path !== ADAPTER_PATH && file.path !== 'src/manifest.config.ts')
      .filter((file) => /claude\.ai/i.test(stripComments(file.text)))
      .map((file) => file.path);

    // manifest.config.ts is exempt: it declares the host permission, which is
    // configuration rather than an HTTP call.
    expect(violations).toEqual([]);
  });
});
