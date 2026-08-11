import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectClaudeMode } from '@/content/themeSync';

/**
 * Matching Claude's own toggle rather than the OS (FEATURES 8.3).
 *
 * The failure this prevents is the most visible kind: a white panel dropped
 * over a dark interface because the user set dark inside Claude while their OS
 * stayed light.
 *
 * Markers observed on claude.ai 2026-08-11:
 *   <html data-theme="claude" data-mode="dark" style="color-scheme: dark">
 */

function fakeRoot(attrs: Record<string, string>, colorScheme = ''): HTMLElement {
  return {
    getAttribute: (name: string) => attrs[name] ?? null,
    // getComputedStyle is stubbed per-test to read this back.
    dataset: attrs,
    __colorScheme: colorScheme,
  } as unknown as HTMLElement;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('getComputedStyle', (el: { __colorScheme?: string }) => ({
    colorScheme: el.__colorScheme ?? '',
  }));
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

describe('detectClaudeMode', () => {
  it('reads Claude’s data-mode first', () => {
    expect(detectClaudeMode(fakeRoot({ 'data-mode': 'dark' }))).toBe('dark');
    expect(detectClaudeMode(fakeRoot({ 'data-mode': 'light' }))).toBe('light');
  });

  it('ignores data-theme, which names the palette rather than the mode', () => {
    // Real value observed is data-theme="claude" — not light or dark.
    expect(detectClaudeMode(fakeRoot({ 'data-theme': 'claude' }, 'dark'))).toBe('dark');
  });

  it('falls back to color-scheme when data-mode is missing', () => {
    expect(detectClaudeMode(fakeRoot({}, 'dark'))).toBe('dark');
    expect(detectClaudeMode(fakeRoot({}, 'light'))).toBe('light');
  });

  it('treats an ambiguous color-scheme as no answer and goes to the OS', () => {
    // "light dark" means the page supports both, not that it picked one.
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    expect(detectClaudeMode(fakeRoot({}, 'light dark'))).toBe('dark');
  });

  it('uses the OS preference when Claude exposes nothing', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    expect(detectClaudeMode(fakeRoot({}))).toBe('dark');

    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    expect(detectClaudeMode(fakeRoot({}))).toBe('light');
  });

  it('prefers Claude over a conflicting OS setting', () => {
    // The whole point: dark Claude on a light OS must not give a white panel.
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    expect(detectClaudeMode(fakeRoot({ 'data-mode': 'dark' }))).toBe('dark');
  });

  it('returns null rather than guessing when nothing is readable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(detectClaudeMode(fakeRoot({}))).toBeNull();
  });

  it('survives a throwing getComputedStyle', () => {
    vi.stubGlobal('getComputedStyle', () => {
      throw new Error('detached');
    });
    vi.stubGlobal('matchMedia', undefined);
    expect(detectClaudeMode(fakeRoot({}))).toBeNull();
  });
});
