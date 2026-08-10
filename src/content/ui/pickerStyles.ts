/**
 * Slash-picker styles, injected into the picker's own shadow root.
 *
 * The picker floats over Claude's composer, so it stays small and quiet: this
 * is an autocomplete, not a dialog.
 */
export const PICKER_STYLES = `
:host, * { box-sizing: border-box; }

.cg-picker {
  position: fixed;
  width: min(420px, 90vw);
  max-height: 46vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #1a1a1a;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .24);
  font: 400 13px/1.45 ui-sans-serif, system-ui, -apple-system, sans-serif;
  overflow: hidden;
}

.cg-list { margin: 0; padding: 5px; list-style: none; overflow-y: auto; }

.cg-item { padding: 7px 9px; border-radius: 7px; cursor: pointer; }
.cg-item[data-active="true"] { background: rgba(0, 0, 0, .07); }

.cg-item-title { font-weight: 550; }

.cg-item-body {
  font-size: 12px;
  color: rgba(0, 0, 0, .6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cg-note { margin: 0; padding: 14px 12px; color: rgba(0, 0, 0, .55); font-size: 12px; }

.cg-foot {
  padding: 7px 11px;
  border-top: 1px solid rgba(0, 0, 0, .08);
  font-size: 11px;
  color: rgba(0, 0, 0, .5);
}

.cg-vars { padding: 10px 11px; display: flex; flex-direction: column; gap: 7px; }
.cg-vars label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }

.cg-input {
  padding: 6px 8px;
  border: 1px solid rgba(0, 0, 0, .18);
  border-radius: 6px;
  font: inherit;
  color: inherit;
  background: transparent;
}

.cg-actions { display: flex; gap: 6px; justify-content: flex-end; }

.cg-btn {
  padding: 5px 10px;
  border: 1px solid rgba(0, 0, 0, .18);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

@media (prefers-color-scheme: dark) {
  .cg-picker { background: #1f1f1f; color: #ededed; }
  .cg-item[data-active="true"] { background: rgba(255, 255, 255, .09); }
  .cg-item-body, .cg-note, .cg-foot { color: rgba(255, 255, 255, .58); }
  .cg-foot { border-top-color: rgba(255, 255, 255, .1); }
  .cg-input, .cg-btn { border-color: rgba(255, 255, 255, .2); }
}
`;
