/**
 * THE ONLY MODULE PERMITTED TO TALK TO claude.ai (CLAUDE.md hard rule 2).
 *
 * Two invariants enforced by tests in tests/:
 *   - read-only-guard: this file may never contain a mutating HTTP verb.
 *     No POST/PUT/PATCH/DELETE to conversation or account endpoints, ever.
 *   - network-allowlist: claude.ai is the only host any src/ file may reference.
 *
 * M0 scaffold: URL builders and the surface area only. Throttling, backoff,
 * zod parsing, selfTest, and degraded status land in M1 (ARCHITECTURE §3).
 * Endpoint shapes below are UNVERIFIED until the M0 spike records real
 * responses in docs/api-notes.md. Treat every one as unstable.
 */

const CLAUDE_ORIGIN = 'https://claude.ai';

/** Sync status surfaced to the UI. Never throw to the user; degrade instead. */
export type SyncStatus = 'idle' | 'syncing' | 'degraded';

function apiUrl(path: string): string {
  return `${CLAUDE_ORIGIN}/api${path}`;
}

/**
 * Same-origin GET carrying the user's existing claude.ai session cookies.
 * Deliberately hard-codes the method: there is no parameter that could let a
 * caller turn this into a write.
 */
async function getJson(path: string): Promise<unknown> {
  const response = await fetch(apiUrl(path), {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`claude.ai returned ${String(response.status)} for ${path}`);
  }

  return response.json();
}

/** GET /api/organizations */
export function listOrganizations(): Promise<unknown> {
  return getJson('/organizations');
}

/** GET /api/organizations/{org}/chat_conversations?limit&offset */
export function listConversations(
  orgId: string,
  limit = 50,
  offset = 0,
): Promise<unknown> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return getJson(`/organizations/${orgId}/chat_conversations?${query.toString()}`);
}

/** GET /api/organizations/{org}/chat_conversations/{uuid} (full detail incl. messages) */
export function getConversation(orgId: string, conversationUuid: string): Promise<unknown> {
  const query = new URLSearchParams({
    tree: 'True',
    rendering_mode: 'messages',
    render_all_tools: 'true',
  });
  return getJson(
    `/organizations/${orgId}/chat_conversations/${conversationUuid}?${query.toString()}`,
  );
}
