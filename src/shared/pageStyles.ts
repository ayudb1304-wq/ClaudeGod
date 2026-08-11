import { THEME_BASE, themeTokens } from './theme';

/**
 * Styles for the extension's own pages: the toolbar popup and the options page.
 *
 * These are real documents rather than shadow roots, so tokens land on `:root`.
 * Injected from each entry point instead of imported as CSS, which keeps the
 * build config unchanged and matches how the content-script surfaces work.
 *
 * The popup was a 280px column of inline styles. Its job is to answer "how much
 * of my limit is left" in one glance, so usage is the hero and everything else
 * is secondary.
 */
export const PAGE_STYLES = `
${themeTokens(':root')}
${THEME_BASE}

body {
  margin: 0;
  background: var(--cg-bg);
  color: var(--cg-text);
  font: 400 var(--cg-fs-body)/var(--cg-lh) var(--cg-font);
  -webkit-font-smoothing: antialiased;
}

/* ---------- popup shell ---------- */

.cg-popup {
  width: 340px;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.cg-brand {
  display: flex;
  align-items: center;
  gap: var(--cg-s3);
  padding: var(--cg-s4) var(--cg-s5);
  border-bottom: 1px solid var(--cg-border);
}

/* A mark rather than a logo: two overlapping violet dots, drawn in CSS so
   there is no asset to load and it tints correctly in both themes. */
.cg-mark-dot {
  width: 16px;
  height: 16px;
  border-radius: var(--cg-r-pill);
  background: var(--cg-accent);
  position: relative;
  flex: none;
}
.cg-mark-dot::after {
  content: "";
  position: absolute;
  inset: 4px 4px auto auto;
  width: 6px;
  height: 6px;
  border-radius: var(--cg-r-pill);
  background: var(--cg-on-accent);
  opacity: .9;
}

.cg-brand-name { font-weight: 600; letter-spacing: -.01em; flex: 1; }

.cg-badge {
  font: 600 10px/1 var(--cg-font);
  letter-spacing: .04em;
  text-transform: uppercase;
  padding: 4px 7px;
  border-radius: var(--cg-r-pill);
  background: var(--cg-accent-soft);
  color: var(--cg-accent);
}

.cg-body { padding: var(--cg-s5); display: flex; flex-direction: column; gap: var(--cg-s6); }

/* ---------- sections ---------- */

.cg-section { display: flex; flex-direction: column; gap: var(--cg-s3); }

.cg-section-title {
  margin: 0;
  font: 600 var(--cg-fs-meta)/1 var(--cg-font);
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--cg-text-faint);
}

.cg-divider { height: 1px; background: var(--cg-border); border: 0; margin: 0; }

/* ---------- usage meter, the popup's hero ---------- */

.cg-usage-hero { display: flex; align-items: baseline; gap: var(--cg-s2); }

.cg-usage-value {
  font: 600 30px/1 var(--cg-font);
  letter-spacing: -.02em;
  font-variant-numeric: tabular-nums;
}

.cg-usage-label { font-size: var(--cg-fs-meta); color: var(--cg-text-muted); }

.cg-meter-row { display: flex; flex-direction: column; gap: var(--cg-s1); }

.cg-meter-head {
  display: flex;
  justify-content: space-between;
  font-size: var(--cg-fs-meta);
  color: var(--cg-text-muted);
}
.cg-meter-head b { font-weight: 600; color: var(--cg-text); font-variant-numeric: tabular-nums; }

.cg-meter-track {
  height: 5px;
  border-radius: var(--cg-r-pill);
  background: var(--cg-bg-raised);
  overflow: hidden;
}

.cg-meter-fill {
  height: 100%;
  border-radius: var(--cg-r-pill);
  background: var(--cg-accent);
  transition: width var(--cg-motion);
}
.cg-meter-fill[data-level="warn"] { background: var(--cg-warn); }
.cg-meter-fill[data-level="danger"] { background: var(--cg-danger); }

/* ---------- lists ---------- */

.cg-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }

.cg-list-row {
  display: flex;
  align-items: center;
  gap: var(--cg-s3);
  padding: 6px var(--cg-s3);
  margin: 0 calc(var(--cg-s3) * -1);
  border-radius: var(--cg-r-ctl);
  transition: background var(--cg-motion);
}
.cg-list-row:hover { background: var(--cg-bg-raised); }

.cg-dot { width: 8px; height: 8px; border-radius: var(--cg-r-pill); flex: none; }

.cg-grow { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.cg-link {
  color: inherit;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.cg-link:hover { color: var(--cg-accent); }

.cg-accent-link { color: var(--cg-accent); text-decoration: none; font-weight: 500; }
.cg-accent-link:hover { text-decoration: underline; }

/* ---------- notices ---------- */

.cg-notice { margin: 0; font-size: var(--cg-fs-meta); color: var(--cg-text-muted); }
.cg-notice[data-tone="ok"] { color: var(--cg-ok); }
.cg-notice[data-tone="warn"] { color: var(--cg-warn); }
.cg-notice[data-tone="danger"] { color: var(--cg-danger); }

.cg-footnote {
  padding: var(--cg-s4) var(--cg-s5);
  border-top: 1px solid var(--cg-border);
  font-size: 10px;
  color: var(--cg-text-faint);
}

/* ---------- options page ---------- */

.cg-page {
  max-width: 680px;
  margin: 0 auto;
  padding: 48px 24px 80px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.cg-page-head { display: flex; align-items: center; gap: var(--cg-s4); }
.cg-page-title { margin: 0; font: 600 22px/1.2 var(--cg-font); letter-spacing: -.02em; }

.cg-card {
  border: 1px solid var(--cg-border);
  border-radius: var(--cg-r-panel);
  background: var(--cg-bg-subtle);
  padding: var(--cg-s6);
  display: flex;
  flex-direction: column;
  gap: var(--cg-s5);
}

.cg-card-title { margin: 0; font: 600 15px/1.3 var(--cg-font); letter-spacing: -.01em; }
.cg-card-lede { margin: 0; color: var(--cg-text-muted); }

.cg-field { display: flex; flex-direction: column; gap: var(--cg-s2); }
.cg-label { font-weight: 550; }
.cg-hint { margin: 0; font-size: var(--cg-fs-meta); color: var(--cg-text-muted); }

.cg-text-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--cg-border-strong);
  border-radius: var(--cg-r-ctl);
  background: var(--cg-bg);
  color: var(--cg-text);
  font: 400 var(--cg-fs-body)/1.4 var(--cg-font);
  outline: none;
  transition: border-color var(--cg-motion), box-shadow var(--cg-motion);
}
.cg-text-input:focus { border-color: var(--cg-accent); box-shadow: var(--cg-focus); }

textarea.cg-text-input { min-height: 96px; resize: vertical; font-family: var(--cg-mono); font-size: 12px; }

.cg-check { display: flex; align-items: center; gap: var(--cg-s3); cursor: pointer; }
.cg-check input { accent-color: var(--cg-accent); width: 15px; height: 15px; }

.cg-range { width: 100%; accent-color: var(--cg-accent); }

.cg-actions { display: flex; align-items: center; gap: var(--cg-s3); flex-wrap: wrap; }

.cg-steps { display: flex; gap: var(--cg-s1); }
.cg-step { width: 22px; height: 3px; border-radius: var(--cg-r-pill); background: var(--cg-border-strong); }
.cg-step[data-on="true"] { background: var(--cg-accent); }

.cg-danger-zone { border-color: var(--cg-danger); }
`;

/** Injected once per page, before first paint, so nothing flashes unstyled. */
export function mountPageStyles(): void {
  const id = 'claudegod-page-styles';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = PAGE_STYLES;
  document.head.appendChild(style);
}
