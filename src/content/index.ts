import { strings } from '@/shared/strings';

/**
 * Content script entry, bootstrapped on https://claude.ai/*.
 *
 * M0 scaffold: renders a hello-world badge to prove injection works and that
 * the bundle loads on the real site. Replaced by the usage widget (M3).
 *
 * Kept as vanilla DOM on purpose: the content script carries a <250KB gz budget
 * and this is throwaway. Preact is reserved for popup/options and the overlay.
 */
function mountScaffoldBadge(): void {
  const id = 'claudegod-scaffold-badge';
  if (document.getElementById(id)) return;

  const badge = document.createElement('div');
  badge.id = id;
  badge.textContent = strings.content.badgeLabel;
  badge.setAttribute('role', 'status');
  badge.style.cssText = [
    'position:fixed',
    'bottom:16px',
    'right:16px',
    'z-index:2147483647',
    'padding:6px 10px',
    'border-radius:6px',
    'font:500 12px/1.4 ui-sans-serif,system-ui,sans-serif',
    'background:rgba(20,20,20,.88)',
    'color:#fff',
    'pointer-events:none',
    'user-select:none',
  ].join(';');

  document.body.appendChild(badge);
}

// document_idle can still fire before body exists on slow navigations.
if (document.body) {
  mountScaffoldBadge();
} else {
  document.addEventListener('DOMContentLoaded', mountScaffoldBadge, { once: true });
}
