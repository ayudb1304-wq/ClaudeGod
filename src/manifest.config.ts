import { defineManifest } from '@crxjs/vite-plugin';
import { APP_NAME, APP_DESCRIPTION } from './shared/strings.ts';
import pkg from '../package.json' with { type: 'json' };

/**
 * PERMISSIONS ARE FROZEN (CLAUDE.md hard rule 5): storage, notifications, alarms,
 * and the single host https://claude.ai/*. If a feature seems to need more,
 * redesign the feature. Any diff to this list must be justified in RELEASE.md.
 */
export default defineManifest({
  manifest_version: 3,
  name: APP_NAME,
  description: APP_DESCRIPTION,
  version: pkg.version,

  permissions: ['storage', 'notifications', 'alarms'],
  host_permissions: ['https://claude.ai/*'],

  // Derived from ClaudeGod-Logo.png at the repo root (the 2000px master —
  // regenerate with `sips -z <size> <size>`). The 128px file is also the
  // notification icon (chrome.notifications requires an iconUrl).
  icons: {
    16: 'icons/icon-16.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },

  background: {
    // Unique basename on purpose: with two entries both named index.ts
    // (content + background), CRXJS wrote the content-script chunk into
    // service-worker-loader.js and the worker failed to register (no
    // `document` in a worker). Verified 2026-08-10 on a real unpacked load.
    service_worker: 'src/background/serviceWorker.ts',
    type: 'module',
  },

  content_scripts: [
    {
      matches: ['https://claude.ai/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],

  action: {
    default_popup: 'src/popup/index.html',
    default_title: APP_NAME,
  },

  options_page: 'src/options/index.html',
});
