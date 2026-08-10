import { render } from 'preact';
import { h } from 'preact';
import { SearchOverlay, type OverlayStatus } from './SearchOverlay';
import { loadOrBuildIndex } from '@/core/searchStore';
import { getEntitlements } from '@/core/entitlements';
import { jumpToMessage } from '../jumpToMessage';
import type { SearchIndex, SearchHit } from '@/core/searchIndex';
import { OVERLAY_STYLES } from './overlayStyles';

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
      onClose: close,
    }),
    mount,
  );
}

async function open(): Promise<void> {
  if (isOpen) return;
  isOpen = true;

  ensureHost();
  const host = hostElement();
  if (host) host.style.display = 'block';
  renderOverlay();

  if (!index) {
    status = 'loading';
    renderOverlay();
    try {
      index = await loadOrBuildIndex();
      status = 'ready';
    } catch {
      // Search over a broken index is not worth faking. Say so calmly.
      status = 'degraded';
    }
    if (isOpen) renderOverlay();
  }
}

function close(): void {
  if (!isOpen) return;
  isOpen = false;
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
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    close();
  };
}

/** Test seam: lets the index be swapped without a database. */
export function __setIndexForTests(next: SearchIndex | null, nextStatus: OverlayStatus): void {
  index = next;
  status = nextStatus;
}
