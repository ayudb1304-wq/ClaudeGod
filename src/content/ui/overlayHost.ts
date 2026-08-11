import { render } from 'preact';
import { h } from 'preact';
import { SearchOverlay, type OverlayStatus } from './SearchOverlay';
import { loadOrBuildIndex } from '@/core/searchStore';
import { getEntitlements, subscribeEntitlements } from '@/core/entitlements';
import { jumpToMessage } from '../jumpToMessage';
import { writeConversationDrag } from '../dragData';
import type { SearchIndex, SearchHit } from '@/core/searchIndex';
import { OVERLAY_STYLES } from './overlayStyles';
import { shieldKeyboardEvents } from './shieldKeyboard';

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

async function open(): Promise<void> {
  if (isOpen) return;
  isOpen = true;

  ensureHost();
  const host = hostElement();
  if (host) host.style.display = 'block';
  document.addEventListener('focusin', onFocusIn);
  renderOverlay();

  await ensureIndex();
}

function close(): void {
  if (!isOpen) return;
  isOpen = false;
  document.removeEventListener('focusin', onFocusIn);
  const host = hostElement();
  if (host) host.style.display = 'none';
  if (mountPoint) render(null, mountPoint);
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

function onKeyDown(event: KeyboardEvent): void {
  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier || event.key.toLowerCase() !== 'k') return;

  // Shift is the always-available binding; plain Cmd+K yields to the composer.
  const isFallbackBinding = event.shiftKey;
  if (!isFallbackBinding && isEditableFocused()) return;

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
    close();
  };
}

/** Test seam: lets the index be swapped without a database. */
export function __setIndexForTests(next: SearchIndex | null, nextStatus: OverlayStatus): void {
  index = next;
  status = nextStatus;
}
