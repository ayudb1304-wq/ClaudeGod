/**
 * Matches our surfaces to Claude's own light/dark mode (FEATURES 8.3).
 *
 * `prefers-color-scheme` alone is not enough: Claude has an in-app toggle, so
 * someone running Claude in dark on a light OS would get a white panel dropped
 * over their dark interface. That is the single most visible way an extension
 * announces it does not belong.
 *
 * Observed on claude.ai 2026-08-11:
 *   <html data-theme="claude" data-mode="dark" style="color-scheme: dark">
 *
 * Degraded-first, per CLAUDE.md. Three signals in descending confidence, and
 * if all three are absent we stamp nothing and the stylesheet's media query
 * takes over, which is exactly the old behaviour.
 */

export type ThemeMode = 'light' | 'dark';

/** Their explicit marker. Most direct, most likely to be renamed. */
function fromDataMode(root: HTMLElement): ThemeMode | null {
  const value = root.getAttribute('data-mode');
  return value === 'dark' || value === 'light' ? value : null;
}

/**
 * The CSS `color-scheme` property. Less likely to churn than a data attribute
 * because the browser itself acts on it, so it is worth reading second.
 */
function fromColorScheme(root: HTMLElement): ThemeMode | null {
  const scheme = getComputedStyle(root).colorScheme;
  const dark = scheme.includes('dark');
  const light = scheme.includes('light');
  if (dark && !light) return 'dark';
  if (light && !dark) return 'light';
  return null;
}

function fromOsPreference(): ThemeMode | null {
  if (typeof matchMedia !== 'function') return null;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Null means "we could not tell", which is a valid answer, not a failure. */
export function detectClaudeMode(root: HTMLElement = document.documentElement): ThemeMode | null {
  try {
    return fromDataMode(root) ?? fromColorScheme(root) ?? fromOsPreference();
  } catch {
    return null;
  }
}

const hosts = new Set<HTMLElement>();
let observer: MutationObserver | null = null;
let mediaQuery: MediaQueryList | null = null;

function apply(): void {
  const mode = detectClaudeMode();
  for (const host of hosts) {
    // Stamping nothing is deliberate: with no attribute the media query in
    // theme.ts decides, which is the correct fallback rather than a guess.
    if (mode) host.setAttribute('data-cg-mode', mode);
    else host.removeAttribute('data-cg-mode');
  }
}

function ensureWatching(): void {
  if (observer) return;

  observer = new MutationObserver(apply);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-mode', 'style', 'class'],
  });

  // The OS can still change under us when Claude exposes no marker at all.
  if (typeof matchMedia === 'function') {
    mediaQuery = matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', apply);
  }
}

/**
 * Registers a shadow host to follow Claude's theme.
 *
 * Call once per surface, right after attachShadow. Returns an unregister so a
 * surface that unmounts stops being tracked.
 */
export function followClaudeTheme(host: HTMLElement): () => void {
  hosts.add(host);
  ensureWatching();
  apply();

  return () => {
    hosts.delete(host);
    if (hosts.size === 0) {
      observer?.disconnect();
      observer = null;
      mediaQuery?.removeEventListener('change', apply);
      mediaQuery = null;
    }
  };
}

export function resetThemeSyncForTests(): void {
  hosts.clear();
  observer?.disconnect();
  observer = null;
  mediaQuery?.removeEventListener('change', apply);
  mediaQuery = null;
}
