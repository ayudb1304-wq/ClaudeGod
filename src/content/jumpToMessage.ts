/**
 * Jump-to-message (FEATURES 2.1, TASKS M2).
 *
 * Opens a conversation, scrolls to the matched message, and flashes it.
 *
 * DEGRADED-FIRST BY DESIGN. Claude's DOM anchors were never verified in the M0
 * spike, and ARCHITECTURE makes no promises about them, so this tries several
 * strategies in decreasing order of confidence and then gives up quietly. The
 * fallback (conversation opens at the top) is a perfectly usable outcome; a
 * thrown error or a frozen page would not be.
 *
 * CLAUDE.md: "if injection anchor not found, fall back, no crash".
 */

const PENDING_KEY = 'claudegod:pendingJump';
const POLL_INTERVAL_MS = 150;
const POLL_TIMEOUT_MS = 6000;
const FLASH_DURATION_MS = 1600;

interface PendingJump {
  convUuid: string;
  messageUuid: string;
  /** A distinctive slice of the message, used when uuid anchors are absent. */
  textProbe: string;
}

/**
 * sessionStorage rather than chrome.storage: this is transient navigation
 * state, and hard rule 4 keeps conversation-derived text out of chrome.storage
 * entirely. It is cleared as soon as the jump resolves.
 */
function savePending(jump: PendingJump): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(jump));
  } catch {
    // Private mode or a full quota. The conversation still opens.
  }
}

function readPending(): PendingJump | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'convUuid' in parsed &&
      'messageUuid' in parsed
    ) {
      return parsed as PendingJump;
    }
    return null;
  } catch {
    return null;
  }
}

function clearPending(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Attribute names worth trying before falling back to a text scan. */
const UUID_ATTRIBUTES = [
  'data-message-uuid',
  'data-message-id',
  'data-testid',
  'data-test-render-count-id',
];

function findByUuid(messageUuid: string): HTMLElement | null {
  for (const attribute of UUID_ATTRIBUTES) {
    const match = document.querySelector<HTMLElement>(`[${attribute}="${messageUuid}"]`);
    if (match) return match;
  }
  return null;
}

/**
 * Last-resort locator: find the element whose text contains a distinctive slice
 * of the message. Deliberately picks the deepest match so we scroll to the
 * message rather than to a container wrapping the whole thread.
 */
function findByText(probe: string): HTMLElement | null {
  if (probe.length < 12) return null;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.textContent?.includes(probe)) {
      const element = node.parentElement;
      if (element) return element;
    }
    node = walker.nextNode();
  }
  return null;
}

function flash(element: HTMLElement): void {
  const previousTransition = element.style.transition;
  const previousBackground = element.style.backgroundColor;

  element.style.transition = 'background-color 220ms ease';
  // A translucent wash rather than a solid colour, so it reads in both themes
  // without us having to detect which one is active.
  element.style.backgroundColor = 'rgba(217, 119, 6, .22)';

  setTimeout(() => {
    element.style.backgroundColor = previousBackground;
    setTimeout(() => {
      element.style.transition = previousTransition;
    }, 260);
  }, FLASH_DURATION_MS);
}

/** Polls for the target, since the conversation renders asynchronously. */
function resolvePending(jump: PendingJump): void {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  const attempt = (): void => {
    const target = findByUuid(jump.messageUuid) ?? findByText(jump.textProbe);

    if (target) {
      clearPending();
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flash(target);
      return;
    }

    if (Date.now() > deadline) {
      // Give up silently. The conversation is open, which is the degraded but
      // still useful outcome. Nagging the user about a missed scroll would be
      // worse than the missed scroll.
      clearPending();
      return;
    }

    setTimeout(attempt, POLL_INTERVAL_MS);
  };

  attempt();
}

export function conversationUrl(convUuid: string): string {
  return `/chat/${convUuid}`;
}

/**
 * Navigates to a conversation and queues the scroll.
 *
 * When already viewing the conversation, resolves immediately instead of
 * re-navigating, which would throw away the user's scroll position for nothing.
 */
export function jumpToMessage(convUuid: string, messageUuid: string, snippet: string): void {
  const textProbe = snippet.replace(/^…|…$/g, '').trim().slice(0, 60);
  const jump: PendingJump = { convUuid, messageUuid, textProbe };

  if (window.location.pathname.includes(convUuid)) {
    resolvePending(jump);
    return;
  }

  savePending(jump);
  window.location.assign(conversationUrl(convUuid));
}

/** Called on content-script boot to finish a jump that survived navigation. */
export function resumePendingJump(): void {
  const pending = readPending();
  if (pending) resolvePending(pending);
}
