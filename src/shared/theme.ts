/**
 * The single source of design tokens (FEATURES 8.3).
 *
 * Every surface injects this, so a colour or radius is defined once and the
 * five surfaces stop drifting apart. Before this there were nine ad-hoc greys
 * across the codebase and dark mode existed only in the search overlay.
 *
 * Two rules worth keeping:
 *
 * 1. Nothing outside this file may write a raw colour. If a component needs a
 *    shade that is not here, the token set is wrong, not the component.
 * 2. No Anthropic brand colours (PRD §9). The palette is warm-neutral so it
 *    sits comfortably beside Claude, and the accent is deliberately our own
 *    violet rather than anything resembling their clay.
 */

/** Violet, chosen to read as a developer tool and not as Anthropic's brand. */
export const ACCENT_LIGHT = '#6E56CF';
/** Lifted for dark surfaces: the light-mode violet goes muddy on near-black. */
export const ACCENT_DARK = '#8B72E8';

/**
 * `scope` is `:host` inside a shadow root and `:root` on the popup and options
 * pages. Same tokens either way.
 */
export function themeTokens(scope: ':host' | ':root'): string {
  return `
${scope} {
  --cg-bg: #ffffff;
  --cg-bg-subtle: #faf9f8;
  --cg-bg-raised: #f3f1ef;
  --cg-bg-scrim: rgba(28, 25, 23, .42);

  --cg-border: rgba(23, 20, 18, .10);
  --cg-border-strong: rgba(23, 20, 18, .17);

  --cg-text: #1b1917;
  --cg-text-muted: rgba(27, 25, 23, .62);
  --cg-text-faint: rgba(27, 25, 23, .44);

  --cg-accent: ${ACCENT_LIGHT};
  --cg-accent-hover: #5c46b3;
  --cg-accent-soft: rgba(110, 86, 207, .11);
  --cg-accent-mark: rgba(110, 86, 207, .22);
  --cg-on-accent: #ffffff;

  --cg-ok: #2f7d55;
  --cg-warn: #b4621f;
  --cg-danger: #b03a2e;

  /* One elevation, not three. Depth comes from the scrim, not stacked shadows. */
  --cg-shadow: 0 16px 48px rgba(23, 20, 18, .14), 0 2px 6px rgba(23, 20, 18, .06);
  --cg-shadow-sm: 0 4px 14px rgba(23, 20, 18, .10);

  --cg-r-panel: 12px;
  --cg-r-row: 8px;
  --cg-r-ctl: 6px;
  --cg-r-pill: 999px;

  --cg-s1: 4px;
  --cg-s2: 6px;
  --cg-s3: 8px;
  --cg-s4: 12px;
  --cg-s5: 16px;
  --cg-s6: 20px;

  --cg-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --cg-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --cg-fs-input: 15px;
  --cg-fs-body: 13px;
  --cg-fs-meta: 11px;
  --cg-lh: 1.45;

  --cg-motion: 140ms cubic-bezier(.2, .7, .3, 1);
  --cg-focus: 0 0 0 2px var(--cg-accent-soft), 0 0 0 1px var(--cg-accent);
}

@media (prefers-color-scheme: dark) {
  ${scope} {
    --cg-bg: #1a1a1c;
    --cg-bg-subtle: #141416;
    --cg-bg-raised: #26262a;
    --cg-bg-scrim: rgba(0, 0, 0, .55);

    --cg-border: rgba(255, 255, 255, .09);
    --cg-border-strong: rgba(255, 255, 255, .17);

    --cg-text: #ecebe9;
    --cg-text-muted: rgba(236, 235, 233, .62);
    --cg-text-faint: rgba(236, 235, 233, .42);

    --cg-accent: ${ACCENT_DARK};
    --cg-accent-hover: #9d88ee;
    --cg-accent-soft: rgba(139, 114, 232, .18);
    --cg-accent-mark: rgba(139, 114, 232, .30);
    --cg-on-accent: #16121f;

    --cg-ok: #5cbb85;
    --cg-warn: #d59247;
    --cg-danger: #e07a6b;

    --cg-shadow: 0 20px 56px rgba(0, 0, 0, .50), 0 2px 8px rgba(0, 0, 0, .32);
    --cg-shadow-sm: 0 4px 16px rgba(0, 0, 0, .38);
  }
}

/* Respect the OS setting. Motion is decoration here, never information. */
@media (prefers-reduced-motion: reduce) {
  ${scope} { --cg-motion: 1ms linear; }
}
`;
}

/**
 * Shared primitives every surface needs: box sizing, focus rings, buttons and
 * the keyboard-hint chips the overlay footer uses.
 */
export const THEME_BASE = `
*, *::before, *::after { box-sizing: border-box; }

.cg-root {
  font: 400 var(--cg-fs-body)/var(--cg-lh) var(--cg-font);
  color: var(--cg-text);
  -webkit-font-smoothing: antialiased;
}

/* Focus is never removed, only replaced. Keyboard users need to see it. */
.cg-focusable:focus-visible,
button:focus-visible,
input:focus-visible,
a:focus-visible {
  outline: none;
  box-shadow: var(--cg-focus);
  border-radius: var(--cg-r-ctl);
}

.cg-btn {
  appearance: none;
  border: 1px solid var(--cg-border-strong);
  background: var(--cg-bg);
  color: var(--cg-text);
  font: 500 var(--cg-fs-body)/1 var(--cg-font);
  padding: 7px 12px;
  border-radius: var(--cg-r-ctl);
  cursor: pointer;
  transition: background var(--cg-motion), border-color var(--cg-motion);
}
.cg-btn:hover:not(:disabled) { background: var(--cg-bg-raised); }
.cg-btn:disabled { opacity: .5; cursor: default; }

.cg-btn-primary {
  background: var(--cg-accent);
  border-color: transparent;
  color: var(--cg-on-accent);
}
.cg-btn-primary:hover:not(:disabled) { background: var(--cg-accent-hover); }

/* Keyboard hints, Raycast-style: the footer teaches the shortcuts. */
.cg-kbd {
  display: inline-block;
  min-width: 18px;
  padding: 2px 5px;
  border: 1px solid var(--cg-border-strong);
  border-radius: 4px;
  background: var(--cg-bg-raised);
  color: var(--cg-text-muted);
  font: 500 10px/1.2 var(--cg-mono);
  text-align: center;
}

.cg-muted { color: var(--cg-text-muted); }
.cg-faint { color: var(--cg-text-faint); font-size: var(--cg-fs-meta); }
`;

/** Convenience for shadow roots, which always want both blocks. */
export function shadowTheme(): string {
  return themeTokens(':host') + THEME_BASE;
}
