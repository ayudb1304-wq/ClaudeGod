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
    openSettings: 'Settings',
  },

  options: {
    title: `${APP_NAME} settings`,
    scaffoldNotice: 'Settings arrive in M5. This page exists so the extension boots end to end.',
  },

  search: {
    placeholder: 'Search your Claude chats',
    ariaLabel: 'Search your Claude chats',
    loading: 'Getting your chats ready…',
    untitled: 'Untitled chat',
    prompt: (indexed: number) =>
      indexed > 0
        ? `Type to search ${String(indexed)} indexed chats.`
        : 'Nothing indexed yet. Start indexing from the extension popup.',
    noResults: (query: string) => `No matches for "${query}". Try fewer or different words.`,
    footerPro: 'Searching your full history.',
    footerFree: (cap: number) =>
      `Searching your last ${String(cap)} chats. Upgrade for full history.`,
  },

  usage: {
    widgetTitle: 'Usage',
    session: '5-hour session',
    week: 'Weekly',
    resetsIn: (duration: string) => `Resets in ${duration}`,
    updatedAgo: (duration: string) => `Updated ${duration} ago`,
    // Degraded path (ARCHITECTURE §5): calm, and never a guessed number.
    unavailable: 'Usage info is taking a break. It will be back when Claude responds again.',
    popupEmpty: 'Open claude.ai to load your usage.',
    popupLoading: 'Loading usage…',
    collapse: 'Collapse usage widget',
    expand: 'Expand usage widget',
    alertTitle: (percent: number) => `Claude session at ${String(percent)}%`,
    alertMessage: (percent: number, reset: string | null) =>
      reset
        ? `You've used ${String(percent)}% of your 5-hour window. It resets in ${reset}.`
        : `You've used ${String(percent)}% of your 5-hour window.`,
  },

  sync: {
    // Calm, actionable error copy (CLAUDE.md). Never blame the user, never alarm them.
    degraded: 'Sync paused: Claude changed something. Your indexed chats still work.',
    progress: (indexed: number) => `Indexing your chats: ${String(indexed)} done`,
    progressWithTotal: (indexed: number, total: number) =>
      `Indexed ${String(indexed)}/${String(total)} chats`,
  },
} as const;
