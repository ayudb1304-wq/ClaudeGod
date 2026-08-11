import { shadowTheme } from '@/shared/theme';

/**
 * Slash-picker styles, injected into the picker's own shadow root.
 *
 * The picker floats over Claude's composer, so it stays small and quiet: this
 * is an autocomplete, not a dialog.
 */
export const PICKER_STYLES = `
${shadowTheme()}

.cg-picker {
  position: fixed;
  width: min(420px, 90vw);
  max-height: 46vh;
  display: flex;
  flex-direction: column;
  background: var(--cg-bg);
  color: var(--cg-text);
  border-radius: var(--cg-r-panel);
  box-shadow: var(--cg-shadow-sm);
  font: 400 13px/1.45 ui-sans-serif, system-ui, -apple-system, sans-serif;
  overflow: hidden;
}

.cg-list { margin: 0; padding: 5px; list-style: none; overflow-y: auto; }

.cg-item { padding: 7px 9px; border-radius: 7px; cursor: pointer; }
.cg-item[data-active="true"] { background: var(--cg-accent-soft); }

.cg-item-title { font-weight: 550; }

.cg-item-body {
  font-size: 12px;
  color: var(--cg-bg-raised);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cg-note { margin: 0; padding: 14px 12px; color: var(--cg-text-muted); font-size: 12px; }

.cg-foot {
  padding: 7px 11px;
  border-top: 1px solid var(--cg-border);
  font-size: 11px;
  color: var(--cg-text-faint);
}

.cg-vars { padding: 10px 11px; display: flex; flex-direction: column; gap: 7px; }
.cg-vars label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }

.cg-input {
  padding: 6px 8px;
  border: 1px solid var(--cg-border-strong);
  border-radius: var(--cg-r-ctl);
  font: inherit;
  color: inherit;
  background: transparent;
}

.cg-actions { display: flex; gap: 6px; justify-content: flex-end; }

.cg-btn {
  padding: 5px 10px;
  border: 1px solid var(--cg-border-strong);
  border-radius: var(--cg-r-ctl);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

`;
