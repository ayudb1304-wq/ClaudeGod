import { conversationUuidFromUrl } from './dragData';

/**
 * Pointer-based drag of a chat out of Claude's own sidebar (FEATURES 4.1).
 *
 * Why this exists: their chat links carry `draggable="false"`, so the browser
 * never starts an HTML5 drag from them and no `dragover`/`drop` ever reaches
 * our folder rows. Observed on the real site, 2026-08-11. The HTML5 path still
 * handles our own drag sources (search results); this one handles theirs.
 *
 * It leans on one thing only: a chat is a link whose href contains
 * `/chat/<uuid>`. That is the same assumption the URL bar makes, and it is
 * markedly more durable than any class name of theirs. If they change it, drops
 * simply stop registering — nothing breaks, nothing throws.
 */

const DRAG_THRESHOLD_PX = 6;

interface HrefLike {
  getAttribute?: (name: string) => string | null;
}

/**
 * Walks a composed event path for the first link pointing at a conversation.
 *
 * Uses the path rather than `event.target` because the pointer usually lands on
 * a span or an icon inside the link.
 */
export function conversationUuidFromPath(path: readonly EventTarget[]): string | null {
  for (const node of path) {
    const href = (node as HrefLike).getAttribute?.('href') ?? null;
    const uuid = href ? conversationUuidFromUrl(href) : null;
    if (uuid) return uuid;
  }
  return null;
}

export interface SidebarDragHandlers {
  /** A chat has moved far enough to count as a drag. */
  onStart: (convUuid: string) => void;
  onMove: (x: number, y: number) => void;
  /** Pointer released; the handler decides whether it landed on a folder. */
  onDrop: (convUuid: string, x: number, y: number) => boolean;
  onCancel: () => void;
}

export function watchSidebarDrags(handlers: SidebarDragHandlers): () => void {
  let pending: { convUuid: string; x: number; y: number } | null = null;
  let dragging = false;

  const reset = (): void => {
    pending = null;
    dragging = false;
  };

  const onPointerDown = (event: PointerEvent): void => {
    // Left button only, and never a drag that starts inside our own UI.
    if (event.button !== 0) return;
    const path = event.composedPath();
    if (path.some((node) => node instanceof HTMLElement && node.id.startsWith('claudegod-'))) return;

    const convUuid = conversationUuidFromPath(path);
    pending = convUuid ? { convUuid, x: event.clientX, y: event.clientY } : null;
    dragging = false;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!pending) return;

    if (!dragging) {
      const moved = Math.hypot(event.clientX - pending.x, event.clientY - pending.y);
      // Below the threshold this is still a click, not a drag.
      if (moved < DRAG_THRESHOLD_PX) return;
      dragging = true;
      handlers.onStart(pending.convUuid);
    }

    handlers.onMove(event.clientX, event.clientY);
  };

  /**
   * Claude's link would otherwise navigate on the click that follows the drop,
   * yanking the user into the chat they were merely filing. One-shot, and only
   * after a drop we actually accepted.
   */
  const swallowNextClick = (): void => {
    const swallow = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      window.removeEventListener('click', swallow, true);
    };
    window.addEventListener('click', swallow, true);
    // If no click follows (the pointer left the link), stop listening anyway.
    setTimeout(() => {
      window.removeEventListener('click', swallow, true);
    }, 300);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!pending || !dragging) {
      reset();
      return;
    }
    const { convUuid } = pending;
    reset();

    if (handlers.onDrop(convUuid, event.clientX, event.clientY)) swallowNextClick();
    else handlers.onCancel();
  };

  const onPointerCancel = (): void => {
    if (dragging) handlers.onCancel();
    reset();
  };

  /** Dragging a link with the mouse down would otherwise select text. */
  const onSelectStart = (event: Event): void => {
    if (dragging) event.preventDefault();
  };

  // Capture phase throughout: Claude's own handlers call stopPropagation on
  // some of these, and pointer capture on their side would hide the rest.
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerCancel, true);
  document.addEventListener('selectstart', onSelectStart, true);

  return () => {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerCancel, true);
    document.removeEventListener('selectstart', onSelectStart, true);
  };
}
