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
 *
 * Endpoint shapes verified against a real account 2026-08-10; see
 * docs/api-notes.md for observed responses and the two divergences from
 * ARCHITECTURE §3 (message array is `chat_messages`; artifacts are derived from
 * `tool_use` blocks rather than returned separately). Still treat every shape as
 * unstable: these are internal endpoints with no compatibility contract.
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

/**
 * GET /api/organizations/{org}/usage
 *
 * Authoritative usage, found during the M0 spike. Returns `five_hour` and
 * `seven_day` objects each carrying `utilization` (0-100) and an ISO `resets_at`.
 * This is why M3 needs no client-side estimation; see docs/api-notes.md §5.
 */
export function getUsage(orgId: string): Promise<unknown> {
  return getJson(`/organizations/${orgId}/usage`);
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
