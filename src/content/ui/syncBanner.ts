import { subscribeSyncStatus, type SyncStatusState } from '@/shared/syncStatus';
import { strings } from '@/shared/strings';
import { shadowTheme } from '@/shared/theme';
import { followClaudeTheme } from '../themeSync';

/**
 * Sync progress and degraded-mode banner (FEATURES 1.1, TASKS M1).
 *
 * Vanilla DOM in a shadow root, like the other content-script surfaces.
 *
 * Deliberately passive: it never blocks the page, never steals focus, and
 * disappears on idle. A user who does not care about sync should not notice it.
 */

const BANNER_ID = 'claudegod-sync-banner';

const BANNER_STYLES = `
${shadowTheme()}

.cg-banner {
  max-width: 320px;
  padding: 9px var(--cg-s4);
  border-radius: var(--cg-r-row);
  border: 1px solid var(--cg-border);
  background: var(--cg-bg);
  box-shadow: var(--cg-shadow-sm);
  display: flex;
  align-items: center;
  gap: var(--cg-s3);
}

/* Degraded is a warning, not an error: search still works over what is
   indexed, so it gets a tinted edge rather than a red slab. */
.cg-banner[data-kind="degraded"] {
  border-color: var(--cg-warn);
  color: var(--cg-warn);
}

.cg-banner-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--cg-r-pill);
  background: var(--cg-accent);
  flex: none;
}
.cg-banner[data-kind="degraded"] .cg-banner-dot { background: var(--cg-warn); }

/* Only the syncing state pulses, and only when motion is allowed. */
.cg-banner[data-kind="syncing"] .cg-banner-dot { animation: cg-pulse 1.6s ease-in-out infinite; }
@keyframes cg-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
@media (prefers-reduced-motion: reduce) {
  .cg-banner[data-kind="syncing"] .cg-banner-dot { animation: none }
}
`;

interface BannerParts {
  host: HTMLElement;
  banner: HTMLElement;
  text: HTMLElement;
}

let parts: BannerParts | null = null;

function ensureBanner(): BannerParts {
  if (parts && document.getElementById(BANNER_ID)) return parts;

  const host = document.createElement('div');
  host.id = BANNER_ID;
  host.style.cssText = 'all:initial;position:fixed;bottom:16px;right:16px;z-index:2147483647';

  const root = host.attachShadow({ mode: 'open' });
  // Match Claude's own light/dark toggle, not just the OS (FEATURES 8.3).
  followClaudeTheme(host);
  const style = document.createElement('style');
  style.textContent = BANNER_STYLES;
  root.appendChild(style);

  const banner = document.createElement('div');
  banner.className = 'cg-root cg-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');

  const dot = document.createElement('span');
  dot.className = 'cg-banner-dot';
  const text = document.createElement('span');
  banner.append(dot, text);
  root.appendChild(banner);

  document.body.appendChild(host);
  parts = { host, banner, text };
  return parts;
}

function removeBanner(): void {
  document.getElementById(BANNER_ID)?.remove();
  parts = null;
}

function render(state: SyncStatusState): void {
  if (state.kind === 'idle') {
    removeBanner();
    return;
  }

  const { banner, text } = ensureBanner();
  banner.setAttribute('data-kind', state.kind);

  if (state.kind === 'degraded') {
    // Calm and actionable, never alarming: already-indexed chats still search.
    text.textContent = strings.sync.degraded;
    return;
  }

  const indexed = state.progress?.indexed ?? 0;
  const total = state.progress?.total;
  text.textContent = total
    ? strings.sync.progressWithTotal(indexed, total)
    : strings.sync.progress(indexed);
}

export function mountSyncBanner(): () => void {
  return subscribeSyncStatus((state) => {
    try {
      render(state);
    } catch {
      // Claude owns this DOM. If a render fails we stay silent rather than
      // breaking the page the user is actually trying to use.
    }
  });
}
