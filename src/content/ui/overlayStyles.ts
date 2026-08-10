/**
 * Overlay styles, injected into the shadow root.
 *
 * Theming follows the system preference rather than reading Claude's DOM for a
 * theme class: their class names are exactly the kind of anchor that breaks on
 * a redesign, and `prefers-color-scheme` cannot. Matching their in-app toggle
 * exactly is a P1 concern (FEATURES 8.3).
 */
export const OVERLAY_STYLES = `
:host, * { box-sizing: border-box; }

.cg-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: rgba(0, 0, 0, .42);
  font: 400 14px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
}

.cg-panel {
  width: min(680px, 92vw);
  max-height: 68vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #1a1a1a;
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, .28);
  overflow: hidden;
}

.cg-input {
  width: 100%;
  padding: 16px 18px;
  border: 0;
  border-bottom: 1px solid rgba(0, 0, 0, .1);
  font: inherit;
  font-size: 15px;
  color: inherit;
  background: transparent;
  outline: none;
}

.cg-state {
  margin: 0;
  padding: 28px 18px;
  text-align: center;
  color: rgba(0, 0, 0, .55);
}

.cg-results {
  margin: 0;
  padding: 6px;
  list-style: none;
  overflow-y: auto;
}

.cg-row {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
}

/* Also the focus indicator: keyboard nav moves this, never a browser ring. */
.cg-row-active { background: rgba(0, 0, 0, .06); }

.cg-row-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 3px;
}

.cg-title {
  font-weight: 550;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cg-date {
  flex: none;
  font-size: 12px;
  color: rgba(0, 0, 0, .45);
}

.cg-snippet {
  font-size: 13px;
  color: rgba(0, 0, 0, .68);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cg-mark {
  background: rgba(217, 119, 6, .28);
  color: inherit;
  border-radius: 2px;
}

.cg-footer {
  padding: 9px 16px;
  border-top: 1px solid rgba(0, 0, 0, .08);
  font-size: 12px;
  color: rgba(0, 0, 0, .5);
}

@media (prefers-color-scheme: dark) {
  .cg-panel { background: #1f1f1f; color: #ededed; }
  .cg-input { border-bottom-color: rgba(255, 255, 255, .12); }
  .cg-state { color: rgba(255, 255, 255, .58); }
  .cg-row-active { background: rgba(255, 255, 255, .08); }
  .cg-date { color: rgba(255, 255, 255, .45); }
  .cg-snippet { color: rgba(255, 255, 255, .72); }
  .cg-footer {
    border-top-color: rgba(255, 255, 255, .1);
    color: rgba(255, 255, 255, .5);
  }
  .cg-mark { background: rgba(245, 158, 11, .32); }
}
`;
