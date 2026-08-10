import { mountSyncBanner } from './ui/syncBanner';
import { mountSearchOverlay } from './ui/overlayHost';
import { resumePendingJump } from './jumpToMessage';

/**
 * Content script entry, bootstrapped on https://claude.ai/*.
 *
 * Owns the DOM UI and the same-origin API fetches that inherit the user's
 * claude.ai session (ARCHITECTURE §2).
 *
 * Sync is NOT started here. FEATURES 7.2 requires indexing to be opt-in on the
 * onboarding screen, so nothing may begin reading the account before the user
 * has consented. Wiring that consent to runSync lands in M5.
 */
function bootstrap(): void {
  mountSyncBanner();
  mountSearchOverlay();
  // Finishes a jump whose navigation reloaded the content script.
  resumePendingJump();
}

// document_idle can still fire before body exists on slow navigations.
if (document.body) {
  bootstrap();
} else {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
}
