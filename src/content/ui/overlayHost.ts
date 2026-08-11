import { render } from 'preact';
import { h } from 'preact';
import { SearchOverlay, type OverlayStatus } from './SearchOverlay';
import { loadOrBuildIndex } from '@/core/searchStore';
import { getEntitlements, subscribeEntitlements } from '@/core/entitlements';
import { jumpToMessage } from '../jumpToMessage';
import { writeConversationDrag } from '../dragData';
import type { SearchIndex, SearchHit } from '@/core/searchIndex';
import { OVERLAY_STYLES } from './overlayStyles';
import { DEFAULT_SETTINGS, readSettings, type ShortcutSettings } from '@/shared/settings';
import { subscribeSyncChanges } from '@/shared/storage';
import { shieldKeyboardEvents } from './shieldKeyboard';
import { followClaudeTheme } from '../themeSync';

/**
 * Mounts the search overlay into a shadow root.
 *
 * Shadow DOM is load-bearing, not decoration: Claude owns this page, and a
 * plain div would inherit their cascade (and leak ours into theirs). An
 * extension that visibly breaks the host page gets uninstalled.
 */

const HOST_ID = 'claudegod-overlay-host';

let shadow: ShadowRoot | null = null;
let mountPoint: HTMLDivElement | null = null;
let index: SearchIndex | null = null;
let status: OverlayStatus = 'loading';
let isOpen = false;

function ensureHost(): { shadow: ShadowRoot; mount: HTMLDivElement } {
  if (shadow && mountPoint) return { shadow, mount: mountPoint };

  const host = document.createElement('div');
  host.id = HOST_ID;
  // The host itself must not affect layout; only the overlay inside it paints.
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483646;display:none';
  document.body.appendChild(host);

  const root = host.attachShadow({ mode: 'open' });
  // Match Claude's own light/dark toggle, not just the OS (FEATURES 8.3).
  followClaudeTheme(host);

  // Claude redirects loose keystrokes into its composer, and shadow retargeting
  // hides our focused input from their check. See shieldKeyboard.ts.
  shieldKeyboardEvents(host);

  const style = document.createElement('style');
  style.textContent = OVERLAY_STYLES;
  root.appendChild(style);

  const mount = document.createElement('div');
  root.appendChild(mount);

  shadow = root;
  mountPoint = mount;
  return { shadow: root, mount };
}

function hostElement(): HTMLElement | null {
  return document.getElementById(HOST_ID);
}

function renderOverlay(): void {
  const { mount } = ensureHost();
  const entitlements = getEntitlements();

  render(
    h(SearchOverlay, {
      status,
      indexedCount: index?.documentCount ?? 0,
      cap: entitlements.searchConversationCap,
      onSearch: (query: string) => index?.search(query) ?? [],
      onSelect: (hit: SearchHit) => {
        close();
        jumpToMessage(hit.convUuid, hit.messageUuid, hit.snippet);
      },
      onDragHit: (hit: SearchHit, transfer: DataTransfer | null) => {
        if (!transfer) return;
        writeConversationDrag(transfer, hit.convUuid);
        // The overlay covers the folder panel, so it has to get out of the way —
        // but only after the browser has taken its drag image, or the drag
        // aborts with the source element.
        setTimeout(close, 0);
      },
      onClose: close,
    }),
    mount,
  );
}

/** Re-focuses the overlay input if the page steals focus while we are open. */
function onFocusIn(event: FocusEvent): void {
  if (!isOpen) return;
  const host = hostElement();
  if (!host || !(event.target instanceof Node) || host.contains(event.target)) return;
  const input = mountPoint?.querySelector('input');
  input?.focus();
}

/** Builds the index if we do not hold one. Safe to call while open. */
async function ensureIndex(): Promise<void> {
  if (index) return;

  status = 'loading';
  if (isOpen) renderOverlay();
  try {
    index = await loadOrBuildIndex();
    status = 'ready';
  } catch {
    // Search over a broken index is not worth faking. Say so calmly.
    status = 'degraded';
  }
  if (isOpen) renderOverlay();
}

/**
 * Where focus was before we opened, so it can go back.
 *
 * Without this, dismissing the overlay drops focus to the document body and a
 * keyboard user restarts from the top of Claude's page.
 */
let focusBeforeOpen: HTMLElement | null = null;

/** Tabbable nodes inside the panel, in document order. */
function focusables(): HTMLElement[] {
  if (!mountPoint) return [];
  return [
    ...mountPoint.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => element.offsetParent !== null || element.tagName === 'INPUT');
}

/**
 * Keeps Tab inside the dialog (WAI-ARIA modal pattern).
 *
 * It is declared aria-modal, which tells a screen reader the rest of the page
 * is inert; without a trap, sighted keyboard users would tab out into content
 * their assistive tech has been told to ignore.
 */
function onTrapKeydown(event: KeyboardEvent): void {
  if (!isOpen || event.key !== 'Tab') return;

  const items = focusables();
  if (items.length === 0) return;

  const first = items[0];
  const last = items[items.length - 1];
  const active = mountPoint?.getRootNode() instanceof ShadowRoot ? shadow?.activeElement : null;

  if (event.shiftKey && (active === first || active === null)) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first?.focus();
  }
}

async function open(): Promise<void> {
  if (isOpen) return;
  isOpen = true;

  focusBeforeOpen = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  ensureHost();
  const host = hostElement();
  if (host) host.style.display = 'block';
  document.addEventListener('focusin', onFocusIn);
  window.addEventListener('keydown', onTrapKeydown, true);
  renderOverlay();

  await ensureIndex();
}

function close(): void {
  if (!isOpen) return;
  isOpen = false;
  document.removeEventListener('focusin', onFocusIn);
  window.removeEventListener('keydown', onTrapKeydown, true);
  const host = hostElement();
  if (host) host.style.display = 'none';
  if (mountPoint) render(null, mountPoint);

  // Put the user back where they were, but never steal focus into a element
  // that has since left the page.
  if (focusBeforeOpen?.isConnected) focusBeforeOpen.focus();
  focusBeforeOpen = null;
}

/**
 * True when the user is typing into Claude's composer or any other field.
 *
 * FEATURES 2.1 requires Cmd+K not to fight the message input. Rather than
 * guessing at Claude's selectors, this asks the document what has focus, which
 * survives any redesign they ship.
 */
function isEditableFocused(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  if (active.isContentEditable) return true;
  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Live copy of the configured binding; refreshed when settings change. */
let shortcut: ShortcutSettings = DEFAULT_SETTINGS.searchShortcut;

function onKeyDown(event: KeyboardEvent): void {
  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier || event.key.toLowerCase() !== shortcut.key) return;

  // Shift is the always-available binding; plain Cmd+<key> yields to the
  // composer. When the user has asked for Shift, plain never opens us at all.
  if (shortcut.requireShift && !event.shiftKey) return;
  if (!event.shiftKey && isEditableFocused()) return;

  event.preventDefault();
  event.stopPropagation();

  if (isOpen) {
    close();
  } else {
    void open();
  }
}

export function mountSearchOverlay(): () => void {
  // Capture phase so we see the key before Claude's own handlers.
  window.addEventListener('keydown', onKeyDown, true);

  const refreshShortcut = (): void => {
    void readSettings().then((settings) => {
      shortcut = settings.searchShortcut;
    });
  };
  refreshShortcut();
  // Settings live in storage.sync, so a rebind on another device or in the
  // options tab reaches this page without a reload.
  const unsubscribeSettings = subscribeSyncChanges((keys) => {
    if (keys.includes('settings')) refreshShortcut();
  });

  /*
   * The index is cached for the page session, and it is built for one tier.
   * Activating Pro in another tab must not leave this tab searching 100
   * conversations until reload, so drop the cache and let the next open
   * rebuild at the new cap.
   */
  let lastCap = getEntitlements().searchConversationCap;
  const unsubscribe = subscribeEntitlements((value) => {
    if (value.searchConversationCap === lastCap) return;
    lastCap = value.searchConversationCap;
    index = null;
    status = 'loading';
    // Rebuild eagerly only if the user is looking at it; otherwise the next
    // open picks up the new cap.
    if (isOpen) void ensureIndex();
  });

  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    unsubscribe();
    unsubscribeSettings();
    close();
  };
}

/** Test seam: lets the index be swapped without a database. */
export function __setIndexForTests(next: SearchIndex | null, nextStatus: OverlayStatus): void {
  index = next;
  status = nextStatus;
}
