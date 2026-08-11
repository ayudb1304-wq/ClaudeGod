import { mountSyncBanner } from './ui/syncBanner';
import { mountSearchOverlay } from './ui/overlayHost';
import { mountUsageWidget } from './ui/usageWidget';
import { mountFolderPanel } from './ui/panelHost';
import { mountSlashPicker } from './ui/slashPicker';
import { resumePendingJump } from './jumpToMessage';
import { mountSyncBridge } from './syncBridge';
import { startUsagePolling } from '@/core/usage';
import { getChatOrganization, getUsage } from '@/api/claudeAdapter';

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
  // Serves the popup's "Start indexing" command. Listening is not indexing:
  // nothing runs until the user presses the button (FEATURES 7.2).
  mountSyncBridge();
  // Finishes a jump whose navigation reloaded the content script.
  resumePendingJump();

  // Folders and prompts (M4): both read chrome.storage.sync only. Neither
  // touches claude.ai, so neither waits on the M5 indexing consent.
  mountFolderPanel();
  mountSlashPicker();

  // Usage polling starts without the M5 onboarding consent on purpose: that
  // consent gates *indexing conversations* (FEATURES 7.2). /usage returns two
  // account-level percentages, stores no conversation content, and is the
  // headline feature users install for (PRD §4).
  mountUsageWidget();
  startUsagePolling({ getChatOrganization, getUsage });

  // Compile-time gate: a plain `pnpm build` erases this branch and the module.
  if (import.meta.env.VITE_DEV_HOOKS === '1') {
    void import('./devHooks').then((hooks) => {
      hooks.installDevHooks();
    });
  }
}

// document_idle can still fire before body exists on slow navigations.
if (document.body) {
  bootstrap();
} else {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
}
