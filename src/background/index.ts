/**
 * MV3 service worker.
 *
 * Owns: alarms (sync ticks, license revalidation), notifications.
 * Does NOT own: claude.ai network access. That belongs to the content script
 * via api/claudeAdapter.ts, which needs the page's same-origin session.
 *
 * M0 scaffold: proves the worker registers and survives install. Alarm and
 * notification wiring lands in M3 (usage alerts) and M5 (license revalidation).
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Onboarding (FEATURES 7.2) opens here in M5. Sync is opt-in on that screen,
    // so nothing may start indexing before the user consents.
  }
});

export {};
