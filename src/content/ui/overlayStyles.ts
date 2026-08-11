import { shadowTheme } from '@/shared/theme';

/**
 * Search overlay styling.
 *
 * Structure borrowed from Raycast: one input, dense scannable rows, an active
 * row marked by an accent bar rather than a heavy fill, and a persistent footer
 * carrying keyboard hints.
 *
 * Deliberately NOT glassmorphic. The panel floats over arbitrary conversation
 * content, so a blurred backdrop would put our text on an unpredictable surface
 * and make contrast unknowable, which breaks the a11y bar in FEATURES 8.3. The
 * scrim carries the depth instead, and the panel stays opaque with one known
 * contrast ratio. `backdrop-filter` is also expensive on a page as heavy as
 * Claude's, and it repaints while the page scrolls underneath.
 */
export const OVERLAY_STYLES = `
${shadowTheme()}

.cg-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 11vh;
  background: var(--cg-bg-scrim);
  /* A whisper of blur reads as depth without putting text over it. */
  backdrop-filter: blur(2px);
  animation: cg-fade var(--cg-motion);
}

.cg-panel {
  width: min(660px, 92vw);
  max-height: 66vh;
  display: flex;
  flex-direction: column;
  background: var(--cg-bg);
  border: 1px solid var(--cg-border);
  border-radius: var(--cg-r-panel);
  box-shadow: var(--cg-shadow);
  overflow: hidden;
  animation: cg-rise var(--cg-motion);
}

@keyframes cg-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes cg-rise {
  from { opacity: 0; transform: translateY(-4px) }
  to { opacity: 1; transform: none }
}

.cg-input {
  width: 100%;
  height: 52px;
  padding: 0 var(--cg-s5);
  border: 0;
  border-bottom: 1px solid var(--cg-border);
  background: transparent;
  color: var(--cg-text);
  font: 400 var(--cg-fs-input)/1 var(--cg-font);
  outline: none;
}
.cg-input::placeholder { color: var(--cg-text-faint); }

.cg-state {
  margin: 0;
  padding: 44px var(--cg-s5);
  text-align: center;
  color: var(--cg-text-muted);
}

.cg-results {
  margin: 0;
  padding: var(--cg-s2);
  list-style: none;
  overflow-y: auto;
  scrollbar-width: thin;
}
.cg-results::-webkit-scrollbar { width: 10px }
.cg-results::-webkit-scrollbar-thumb {
  background: var(--cg-border-strong);
  border: 3px solid transparent;
  background-clip: content-box;
  border-radius: var(--cg-r-pill);
}

.cg-row {
  position: relative;
  padding: 9px var(--cg-s4) 9px 14px;
  border-radius: var(--cg-r-row);
  cursor: pointer;
  transition: background var(--cg-motion);
}

/* The accent bar carries the selection; the fill stays quiet so long result
   lists do not turn into stripes of colour. */
.cg-row-active { background: var(--cg-accent-soft); }
.cg-row-active::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 10px;
  bottom: 10px;
  width: 2px;
  border-radius: var(--cg-r-pill);
  background: var(--cg-accent);
}

.cg-row-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--cg-s4);
  margin-bottom: 2px;
}

.cg-title {
  font-weight: 550;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cg-date {
  flex: none;
  font-size: var(--cg-fs-meta);
  color: var(--cg-text-faint);
  font-variant-numeric: tabular-nums;
}

.cg-snippet {
  font-size: var(--cg-fs-body);
  color: var(--cg-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cg-mark {
  background: var(--cg-accent-mark);
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
  font-weight: 550;
}

.cg-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cg-s4);
  height: 34px;
  padding: 0 var(--cg-s4) 0 var(--cg-s5);
  border-top: 1px solid var(--cg-border);
  background: var(--cg-bg-subtle);
  font-size: var(--cg-fs-meta);
  color: var(--cg-text-faint);
}

.cg-hints { display: flex; align-items: center; gap: var(--cg-s3); flex: none }
.cg-hint { display: inline-flex; align-items: center; gap: 4px }

.cg-footer a { color: var(--cg-accent); text-decoration: none; font-weight: 500 }
.cg-footer a:hover { text-decoration: underline }
`;
