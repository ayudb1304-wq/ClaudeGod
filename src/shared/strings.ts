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
    scaffoldNotice: 'Shortcuts, sync controls, and licensing arrive in the next release.',
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

  folders: {
    title: 'Folders',
    open: 'Open folders',
    close: 'Close folders',
    empty: 'No folders yet. Create one, then drag chats in.',
    emptyFolder: 'Empty — drag a chat here.',
    create: 'New folder',
    createPlaceholder: 'Folder name',
    add: 'Add',
    cancel: 'Cancel',
    rename: 'Rename folder',
    remove: 'Delete folder',
    removeChat: 'Remove from folder',
    confirmDelete: (name: string) => `Delete "${name}"? Your chats stay where they are.`,
    dropHint: 'Drop to add',
    unknownChat: 'Not in your local copy yet',
    count: (n: number) => (n === 1 ? '1 chat' : `${String(n)} chats`),
    limitReached: (limit: number) =>
      `Free plan includes ${String(limit)} folders. Upgrade for unlimited.`,
    // storage.sync is small by design; say what to do, not what went wrong.
    quotaError: 'Synced storage is full. Remove a few chats from folders and try again.',
    saveError: 'That change did not save. Try again in a moment.',
  },

  prompts: {
    title: 'Prompts',
    empty: 'No saved prompts yet.',
    emptyHint: 'Add prompts in settings, then type / in Claude to insert one.',
    noMatches: 'No prompts match.',
    manage: 'Manage prompts',
    add: 'New prompt',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    remove: 'Delete',
    fieldTitle: 'Title',
    fieldBody: 'Prompt',
    fieldCategory: 'Category (optional)',
    bodyHint: 'Use {{placeholders}} for parts you fill in each time.',
    limitReached: (limit: number) =>
      `Free plan includes ${String(limit)} prompts. Upgrade for unlimited.`,
    variablesTitle: 'Fill in the blanks',
    variablesInsert: 'Insert',
    // Free tier inserts the raw body, placeholders and all (FEATURES 5.1).
    variablesPro: 'Filling placeholders is a Pro feature. Inserting the prompt as written.',
    quotaError: 'Synced storage is full. Delete a prompt or shorten one, then try again.',
  },

  exportUi: {
    chat: 'Export this chat',
    all: 'Export all chats (.zip)',
    folder: 'Export folder (.zip)',
    working: (done: number, total: number) => `Exporting ${String(done)}/${String(total)}…`,
    empty: 'Nothing to export yet.',
    // Export reads the local mirror, so an unsynced chat genuinely has no data.
    notIndexed: 'This chat is not in your local copy yet.',
    failed: 'Export failed. Try again in a moment.',
    proOnly: 'Bulk export is a Pro feature.',
  },

  sync: {
    // Calm, actionable error copy (CLAUDE.md). Never blame the user, never alarm them.
    degraded: 'Sync paused: Claude changed something. Your indexed chats still work.',
    progress: (indexed: number) => `Indexing your chats: ${String(indexed)} done`,
    progressWithTotal: (indexed: number, total: number) =>
      `Indexed ${String(indexed)}/${String(total)} chats`,
  },
} as const;
