import { shadowTheme } from '@/shared/theme';

/**
 * Folder panel styles, injected into the panel's own shadow root.
 *
 * Same reasoning as the search overlay: Claude owns this page, so nothing of
 * ours may inherit or leak styles, and theming follows `prefers-color-scheme`
 * rather than any class name of theirs.
 */
export const PANEL_STYLES = `
${shadowTheme()}

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
  color: var(--cg-text);
}

.cg-drawer {
  width: 268px;
  display: flex;
  flex-direction: column;
  background: var(--cg-bg);
  border-left: 1px solid var(--cg-border);
  box-shadow: 0 0 24px var(--cg-border-strong);
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
  border: 1px solid var(--cg-border);
  border-right: 0;
  border-radius: var(--cg-r-row) 0 0 8px;
  background: var(--cg-bg);
  color: inherit;
  font: inherit;
  font-size: 11px;
  letter-spacing: .04em;
  writing-mode: vertical-rl;
  cursor: pointer;
  box-shadow: -2px 0 8px var(--cg-border);
}

.cg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 12px 8px;
  border-bottom: 1px solid var(--cg-border);
}

.cg-head h2 { margin: 0; font-size: 13px; font-weight: 600; }

.cg-list {
  flex: 1;
  margin: 0;
  padding: 6px;
  list-style: none;
  overflow-y: auto;
}

.cg-folder { border-radius: var(--cg-r-row); margin-bottom: 2px; }
/* Drop target uses the accent, so the whole product speaks one colour. */
.cg-folder[data-over="true"] {
  background: var(--cg-accent-soft);
  outline: 1px dashed var(--cg-accent);
}

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

.cg-count { flex: none; font-size: 11px; color: var(--cg-text-faint); }

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

.cg-chat[data-known="false"] button.cg-link { color: var(--cg-text-faint); font-style: italic; }

.cg-icon {
  flex: none;
  padding: 0 3px;
  border: 0;
  background: none;
  color: var(--cg-text-faint);
  font: inherit;
  cursor: pointer;
}

.cg-icon:hover { color: inherit; }

.cg-empty, .cg-note {
  margin: 0;
  padding: 10px 12px;
  color: var(--cg-text-muted);
  font-size: 12px;
}

.cg-foot {
  padding: 8px 10px;
  border-top: 1px solid var(--cg-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cg-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--cg-border-strong);
  border-radius: var(--cg-r-ctl);
  font: inherit;
  color: inherit;
  background: transparent;
}

.cg-actions { display: flex; gap: 6px; }

.cg-btn {
  padding: 6px 10px;
  border: 1px solid var(--cg-border-strong);
  border-radius: var(--cg-r-ctl);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.cg-btn:disabled { opacity: .5; cursor: default; }

.cg-error { color: var(--cg-danger); }

`;
