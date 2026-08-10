import { subscribeSyncStatus, type SyncStatusState } from '@/shared/syncStatus';
import { strings } from '@/shared/strings';

/**
 * Sync progress and degraded-mode banner (FEATURES 1.1, TASKS M1).
 *
 * Vanilla DOM on purpose: this sits in the content script, which carries a
 * <250KB gz budget, and it renders one line of text.
 *
 * Deliberately passive. It never blocks the page, never steals focus, and
 * disappears on idle. A user who does not care about sync should not notice it.
 */

const BANNER_ID = 'claudegod-sync-banner';

function ensureBanner(): HTMLElement {
  const existing = document.getElementById(BANNER_ID);
  if (existing) return existing;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.style.cssText = [
    'position:fixed',
    'bottom:16px',
    'right:16px',
    'z-index:2147483647',
    'max-width:320px',
    'padding:8px 12px',
    'border-radius:8px',
    'font:400 12px/1.45 ui-sans-serif,system-ui,sans-serif',
    'background:rgba(20,20,20,.9)',
    'color:#f5f5f5',
    'box-shadow:0 2px 10px rgba(0,0,0,.18)',
    'pointer-events:none',
    'user-select:none',
  ].join(';');

  document.body.appendChild(banner);
  return banner;
}

function removeBanner(): void {
  document.getElementById(BANNER_ID)?.remove();
}

function render(state: SyncStatusState): void {
  if (state.kind === 'idle') {
    removeBanner();
    return;
  }

  const banner = ensureBanner();

  if (state.kind === 'degraded') {
    // Calm and actionable, never alarming: already-indexed chats still search.
    banner.textContent = strings.sync.degraded;
    banner.style.background = 'rgba(120,72,20,.94)';
    return;
  }

  const indexed = state.progress?.indexed ?? 0;
  const total = state.progress?.total;
  banner.style.background = 'rgba(20,20,20,.9)';
  banner.textContent = total
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
