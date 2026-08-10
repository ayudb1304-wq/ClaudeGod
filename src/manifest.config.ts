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

  background: {
    service_worker: 'src/background/index.ts',
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
