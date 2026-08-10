/**
 * Single source of truth for free/Pro gates (CLAUDE.md, FEATURES 7.1).
 *
 * Every gate in the app reads from here. No scattered `isPro` checks, so that
 * changing what Pro means is one edit rather than a search-and-replace across
 * features.
 *
 * M2 stub: `isPro` is always false until the license client lands in M5. The
 * shape is final; only the source of the boolean changes.
 */

export interface Entitlements {
  isPro: boolean;
  /** Conversations the search index may hold. null means unlimited. */
  searchConversationCap: number | null;
  maxFolders: number | null;
  maxPrompts: number | null;
  bulkExport: boolean;
  usageAlerts: boolean;
  promptVariables: boolean;
}

/** PRD §6. The free-tier search cap is still open (PRD §12): 100 chats or 30 days. */
export const FREE_SEARCH_CONVERSATION_CAP = 100;

const FREE: Entitlements = {
  isPro: false,
  searchConversationCap: FREE_SEARCH_CONVERSATION_CAP,
  maxFolders: 3,
  maxPrompts: 10,
  bulkExport: false,
  usageAlerts: false,
  promptVariables: false,
};

const PRO: Entitlements = {
  isPro: true,
  searchConversationCap: null,
  maxFolders: null,
  maxPrompts: null,
  bulkExport: true,
  usageAlerts: true,
  promptVariables: true,
};

let current: Entitlements = FREE;
const listeners = new Set<(value: Entitlements) => void>();

export function getEntitlements(): Entitlements {
  return current;
}

export function subscribeEntitlements(listener: (value: Entitlements) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

/** Called by core/license.ts in M5. Nothing else should call this. */
export function setPro(isPro: boolean): void {
  current = isPro ? PRO : FREE;
  for (const listener of listeners) {
    try {
      listener(current);
    } catch {
      /* subscribers are best-effort */
    }
  }
}

export function resetEntitlementsForTests(): void {
  current = FREE;
  listeners.clear();
}
