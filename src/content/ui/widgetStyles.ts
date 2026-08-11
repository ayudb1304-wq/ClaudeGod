import { shadowTheme } from '@/shared/theme';

/**
 * Usage widget styling.
 *
 * Moved into a shadow root with the other surfaces. It previously built nodes
 * straight into Claude's page with inline styles and a hardcoded dark
 * background, so it looked wrong in light mode and carried three meter colours
 * that matched nothing else in the product.
 *
 * The meter thresholds are deliberately identical to the popup's, so the same
 * percentage is the same colour wherever you read it.
 */
export const WIDGET_STYLES = `
${shadowTheme()}

.cg-widget {
  width: 208px;
  border-radius: var(--cg-r-panel);
  border: 1px solid var(--cg-border);
  background: var(--cg-bg);
  box-shadow: var(--cg-shadow-sm);
  overflow: hidden;
  user-select: none;
}

.cg-w-head {
  display: flex;
  align-items: center;
  gap: var(--cg-s2);
  padding: 8px var(--cg-s4);
  cursor: grab;
}
.cg-w-head[data-dragging="true"] { cursor: grabbing; }

.cg-w-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--cg-r-pill);
  background: var(--cg-accent);
  flex: none;
}

.cg-w-title {
  flex: 1;
  font: 600 var(--cg-fs-meta)/1 var(--cg-font);
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--cg-text-faint);
}

.cg-w-toggle {
  appearance: none;
  border: 0;
  background: none;
  color: var(--cg-text-faint);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--cg-r-ctl);
  font: 400 10px/1 var(--cg-font);
  transition: color var(--cg-motion), background var(--cg-motion);
}
.cg-w-toggle:hover { color: var(--cg-text); background: var(--cg-bg-raised); }

.cg-w-body { padding: 0 var(--cg-s4) var(--cg-s4); }

/* An old figure is dimmed so it reads as a record, not as current state. */
.cg-w-body[data-stale="true"] { opacity: .55; }

.cg-w-row { margin-top: var(--cg-s3); }

.cg-w-line {
  display: flex;
  justify-content: space-between;
  gap: var(--cg-s4);
  font-size: var(--cg-fs-meta);
  color: var(--cg-text-muted);
  margin-bottom: 3px;
}
.cg-w-value { font-weight: 600; color: var(--cg-text); font-variant-numeric: tabular-nums; }

.cg-w-track {
  height: 4px;
  border-radius: var(--cg-r-pill);
  background: var(--cg-bg-raised);
  overflow: hidden;
}

.cg-w-fill {
  height: 100%;
  border-radius: var(--cg-r-pill);
  background: var(--cg-accent);
  transition: width var(--cg-motion), background var(--cg-motion);
}
.cg-w-fill[data-level="danger"] { background: var(--cg-danger); }

.cg-w-note {
  margin-top: var(--cg-s3);
  font-size: var(--cg-fs-meta);
  color: var(--cg-text-faint);
}
`;
