/**
 * All user-facing strings live here (i18n-ready, per CLAUDE.md).
 *
 * APP_NAME is the ONLY place the display name is defined. PRD §11 risk 5:
 * the name leads with "Claude", so a forced rename must cost a listing edit
 * and one constant change, never a code sweep. Do not inline it elsewhere.
 */
export const APP_NAME = 'ClaudeGod';

export const APP_DESCRIPTION =
  'Search your Claude chats, track usage limits, organize with folders, save prompts, and export. Everything stays in your browser.';

/** Required on every surface that could be mistaken for an Anthropic product. */
export const UNOFFICIAL_DISCLAIMER = 'Unofficial. Not affiliated with or endorsed by Anthropic.';

export const strings = {
  appName: APP_NAME,
  disclaimer: UNOFFICIAL_DISCLAIMER,

  popup: {
    title: APP_NAME,
    scaffoldNotice: 'Scaffold running. Sync engine lands in M1.',
    openSettings: 'Settings',
  },

  options: {
    title: `${APP_NAME} settings`,
    scaffoldNotice: 'Settings arrive in M5. This page exists so the extension boots end to end.',
  },

  content: {
    /** M0 hello-world badge. Replaced by the usage widget in M3. */
    badgeLabel: APP_NAME,
  },

  sync: {
    // Calm, actionable error copy (CLAUDE.md). Never blame the user, never alarm them.
    degraded: 'Sync paused: Claude changed something. Your indexed chats still work.',
  },
} as const;
