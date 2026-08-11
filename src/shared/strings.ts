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
    hintNavigate: 'navigate',
    hintOpen: 'open',
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

  onboarding: {
    stepCounter: (step: number, total: number) => `Step ${String(step)} of ${String(total)}`,
    step1Title: `Welcome to ${APP_NAME}`,
    step1Body:
      'Search every Claude conversation you have ever had, watch your usage limits, organise chats into folders, save prompts, and export anything.',
    step2Title: 'Your chats stay on this computer',
    step2Body: 'Before anything is read, here is exactly what happens to your data.',
    privacyPoints: [
      'Conversations are stored in this browser and never uploaded.',
      'There is no server, no account, and no analytics.',
      'Read-only: nothing in your Claude account is ever changed or sent.',
      'You can delete everything at any time from this page.',
    ],
    step3Title: 'Ready when you are',
    step3Body:
      'Indexing reads your chat history so it becomes searchable. It runs in your open Claude tab, one request per second, and you can pause or stop it whenever you like.',
    startIndexing: 'Start indexing',
    starting: 'Starting…',
    // Declining must be a real option, not a dark pattern.
    skip: 'Not now',
    next: 'Next',
    back: 'Back',
  },

  upgrade: {
    link: 'Upgrade to Pro',
    // Kept to one short clause each. A gate that lectures is a gate people
    // resent (FEATURES 7.1: quiet, never a nag).
    folders: 'Pro gives you unlimited folders.',
    prompts: 'Pro gives you an unlimited prompt library.',
    bulkExport: 'Bulk export is a Pro feature.',
    alerts: 'Usage alerts are a Pro feature. The meter is always free.',
  },

  settingsUi: {
    title: 'Preferences',
    loading: 'Loading your settings…',
    shortcut: 'Search shortcut',
    shortcutHint: 'Click, then press your combination. Ctrl or Cmd is always required.',
    shortcutCapturing: 'Press keys…',
    shortcutEscapeHint: 'Hold Ctrl or Cmd and press a letter. Escape cancels.',
    shortcutNeedsModifier: 'Hold Ctrl or Cmd as well, so it will not fire while you type.',
    shortcutNeedsLetter: 'Pick a letter, A to Z.',
    shortcutSaveFailed: 'Could not save that shortcut. Try again in a moment.',
    shortcutComposerNote: (fallback: string) =>
      `While you are typing in Claude's message box, use ${fallback} instead.`,
    widget: 'Usage widget',
    widgetShow: 'Show the widget on claude.ai',
    widgetResetButton: 'Reset widget position',
    widgetReset: 'Widget position reset.',
    threshold: (percent: number) => `Alert me at ${String(percent)}% of the 5-hour window`,
    thresholdHint: 'Pro only. The meter itself is always free.',
    data: 'Your data',
    pauseSync: 'Pause indexing',
    pauseSyncHint: 'Stops new indexing runs. Nothing is deleted and search keeps working.',
    wipe: 'Delete all local data',
    // Says exactly what goes, because the user cannot undo it.
    wipeConfirm:
      'This deletes every indexed chat, your search index, folders, prompts and licence from this browser. It cannot be undone.',
    wipeConfirmButton: 'Yes, delete everything',
    wipeDone: 'All local data deleted.',
    wipeFailed: 'Could not delete everything. Try again in a moment.',
    cancel: 'Cancel',
  },

  license: {
    title: 'Pro licence',
    active: 'Pro is active on this device.',
    // Honest about the state without alarming: nothing is broken for them yet.
    activeGrace: 'Pro is active. We could not reach the licence server recently.',
    expired: 'We could not confirm your licence for two weeks, so Pro is paused.',
    freeExplainer: 'You are on the free plan. Paste a licence key to unlock Pro.',
    placeholder: 'Licence key',
    activate: 'Activate',
    activating: 'Activating…',
    remove: 'Remove licence from this device',
    buyLink: 'Get a licence key',
    errorNotFound: 'That key was not recognised. Check for typos and try again.',
    errorCannotActivate: 'That licence cannot be activated. It may have been refunded.',
    errorLimitReached: 'This key is already used on the maximum number of devices.',
    errorNetwork: 'Could not reach the licence server. Check your connection.',
    errorServer: 'The licence server had a problem. Try again in a moment.',
  },

  indexing: {
    title: 'Local index',
    checking: 'Checking…',
    // FEATURES 7.2: the explainer says what syncs and where it lives, before
    // anything is read. Plain and specific, no reassurance theatre.
    consentExplainer: 'Indexing reads your chat history so you can search it.',
    consentPoints: [
      'Everything stays in this browser.',
      'Nothing is uploaded anywhere.',
      'Read-only: your chats are never changed.',
    ],
    nothingYet: 'No chats indexed yet.',
    indexed: (count: number) =>
      `${String(count)} ${count === 1 ? 'chat' : 'chats'} indexed and searchable.`,
    running: (done: number) => `Indexing… ${String(done)} done so far.`,
    keepTabOpen: 'Keep the Claude tab open. You can close this popup.',
    buttonStart: 'Start indexing',
    buttonUpdate: 'Check for new chats',
    buttonRunning: 'Indexing…',
    // Status polling only; starting now opens a tab by itself.
    needsClaudeTab: 'Open a claude.ai tab to see indexing status.',
    // Reached only when we opened a tab and it never came alive, which nearly
    // always means signed out.
    needsReload: 'Could not reach Claude. Check you are signed in at claude.ai, then try again.',
    openedTab: 'Opened a Claude tab in the background to index in.',
    failed: 'Could not start indexing. Try again in a moment.',
    pausedNote: 'Indexing is paused in settings. Search still works over what is already indexed.',
  },

  sync: {
    // Calm, actionable error copy (CLAUDE.md). Never blame the user, never alarm them.
    degraded: 'Sync paused: Claude changed something. Your indexed chats still work.',
    progress: (indexed: number) => `Indexing your chats: ${String(indexed)} done`,
    progressWithTotal: (indexed: number, total: number) =>
      `Indexed ${String(indexed)}/${String(total)} chats`,
  },
} as const;
