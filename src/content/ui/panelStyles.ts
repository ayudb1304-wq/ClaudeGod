/**
 * Folder panel styles, injected into the panel's own shadow root.
 *
 * Same reasoning as the search overlay: Claude owns this page, so nothing of
 * ours may inherit or leak styles, and theming follows `prefers-color-scheme`
 * rather than any class name of theirs.
 */
export const PANEL_STYLES = `
:host, * { box-sizing: border-box; }

/* Right edge, not left: Claude's own chat sidebar lives on the left, and a
   drawer that covers it is a drawer people close and never open again. */
.cg-wrap {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  display: flex;
  flex-direction: row-reverse;
  align-items: stretch;
  font: 400 13px/1.45 ui-sans-serif, system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
}

.cg-drawer {
  width: 268px;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-left: 1px solid rgba(0, 0, 0, .1);
  box-shadow: 0 0 24px rgba(0, 0, 0, .18);
  transition: margin-right .18s ease;
  overflow: hidden;
  /* Keeps the drawer's own controls clear of the usage widget, which floats
     in the bottom-right corner by default. */
  padding-bottom: 76px;
}

.cg-wrap[data-open="false"] .cg-drawer { margin-right: -268px; }

.cg-handles {
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* The handle is the only thing we show by default: one small tab, not a redesign. */
.cg-handle {
  padding: 14px 5px;
  border: 1px solid rgba(0, 0, 0, .1);
  border-right: 0;
  border-radius: 8px 0 0 8px;
  background: #ffffff;
  color: inherit;
  font: inherit;
  font-size: 11px;
  letter-spacing: .04em;
  writing-mode: vertical-rl;
  cursor: pointer;
  box-shadow: -2px 0 8px rgba(0, 0, 0, .12);
}

.cg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 12px 8px;
  border-bottom: 1px solid rgba(0, 0, 0, .08);
}

.cg-head h2 { margin: 0; font-size: 13px; font-weight: 600; }

.cg-list {
  flex: 1;
  margin: 0;
  padding: 6px;
  list-style: none;
  overflow-y: auto;
}

.cg-folder { border-radius: 8px; margin-bottom: 2px; }
.cg-folder[data-over="true"] { background: rgba(217, 119, 6, .16); outline: 1px dashed rgba(217, 119, 6, .7); }

.cg-folder-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  cursor: pointer;
}

.cg-dot { flex: none; width: 9px; height: 9px; border-radius: 50%; }

.cg-folder-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cg-count { flex: none; font-size: 11px; color: rgba(0, 0, 0, .45); }

.cg-chats { margin: 0 0 4px; padding: 0 8px 4px 26px; list-style: none; }

.cg-chat {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
}

.cg-chat button.cg-link {
  flex: 1;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cg-chat[data-known="false"] button.cg-link { color: rgba(0, 0, 0, .45); font-style: italic; }

.cg-icon {
  flex: none;
  padding: 0 3px;
  border: 0;
  background: none;
  color: rgba(0, 0, 0, .45);
  font: inherit;
  cursor: pointer;
}

.cg-icon:hover { color: inherit; }

.cg-empty, .cg-note {
  margin: 0;
  padding: 10px 12px;
  color: rgba(0, 0, 0, .55);
  font-size: 12px;
}

.cg-foot {
  padding: 8px 10px;
  border-top: 1px solid rgba(0, 0, 0, .08);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cg-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid rgba(0, 0, 0, .18);
  border-radius: 6px;
  font: inherit;
  color: inherit;
  background: transparent;
}

.cg-actions { display: flex; gap: 6px; }

.cg-btn {
  padding: 6px 10px;
  border: 1px solid rgba(0, 0, 0, .18);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.cg-btn:disabled { opacity: .5; cursor: default; }

.cg-error { color: #b3492e; }

@media (prefers-color-scheme: dark) {
  .cg-wrap { color: #ededed; }
  .cg-drawer { background: #1c1c1c; border-left-color: rgba(255, 255, 255, .12); }
  .cg-handle { background: #1c1c1c; border-color: rgba(255, 255, 255, .14); }
  .cg-head { border-bottom-color: rgba(255, 255, 255, .1); }
  .cg-count, .cg-icon, .cg-empty, .cg-note { color: rgba(255, 255, 255, .5); }
  .cg-chat[data-known="false"] button.cg-link { color: rgba(255, 255, 255, .45); }
  .cg-foot { border-top-color: rgba(255, 255, 255, .1); }
  .cg-input, .cg-btn { border-color: rgba(255, 255, 255, .2); }
  .cg-error { color: #e08a70; }
}
`;
