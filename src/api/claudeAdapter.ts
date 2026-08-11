import {
  ConversationDetailSchema,
  ConversationListSchema,
  ConversationSummarySchema,
  OrganizationListSchema,
  OrganizationSchema,
  UsageSchema,
  parseArrayLenient,
  parseLenient,
  type ConversationDetail,
  type ConversationSummary,
  type Organization,
  type Usage,
} from './types';
import { setDegraded } from '@/shared/syncStatus';

/**
 * THE ONLY MODULE PERMITTED TO TALK TO claude.ai (CLAUDE.md hard rule 2).
 *
 * Two invariants enforced by tests in tests/:
 *   - read-only-guard: this file may never contain a mutating HTTP verb.
 *     No POST/PUT/PATCH/DELETE to conversation or account endpoints, ever.
 *   - network-allowlist: claude.ai is the only host any src/ file may reference.
 *
 * Endpoint shapes verified 2026-08-10; see docs/api-notes.md for observed
 * responses and the divergences from ARCHITECTURE §3. Treat them as unstable
 * regardless: these are internal endpoints with no compatibility contract.
 */

const CLAUDE_ORIGIN = 'https://claude.ai';

/** ARCHITECTURE §3 rule 2. Never hammer claude.ai (CLAUDE.md rule 7). */
const MIN_REQUEST_INTERVAL_MS = 1000;
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 1000;
const MAX_CONSECUTIVE_FAILURES = 5;

export class AdapterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

/** Thrown once the adapter gives up for this run and flips to degraded mode. */
export class AdapterDegradedError extends AdapterError {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterDegradedError';
  }
}

// ---------------------------------------------------------------------------
// Throttle
// ---------------------------------------------------------------------------

let nextAllowedRequestAt = 0;
let consecutiveFailures = 0;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Serialises requests to at most one per second.
 *
 * Deliberately a shared timestamp rather than a queue: every caller awaits its
 * own slot, so concurrent callers space out instead of bursting. Backfill is a
 * long background job and has no business being fast.
 */
async function acquireSlot(): Promise<void> {
  const now = Date.now();
  const waitFor = Math.max(0, nextAllowedRequestAt - now);
  nextAllowedRequestAt = Math.max(now, nextAllowedRequestAt) + MIN_REQUEST_INTERVAL_MS;
  if (waitFor > 0) await sleep(waitFor);
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Honours Retry-After when present, else exponential backoff with jitter. */
function backoffDelay(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  const exponential = BASE_BACKOFF_MS * 2 ** attempt;
  return exponential + Math.random() * 250;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

function apiUrl(path: string): string {
  return `${CLAUDE_ORIGIN}/api${path}`;
}

/**
 * The web address of a conversation, for links opened outside a claude.ai tab
 * (the popup). Not an HTTP call, but hard rule 2 puts every claude.ai URL in
 * this module, so there is exactly one place an origin change has to land.
 */
export function conversationWebUrl(convUuid: string): string {
  return `${CLAUDE_ORIGIN}/chat/${convUuid}`;
}

/** Match pattern for `chrome.tabs.query`. Same reasoning as above. */
export const CLAUDE_TAB_PATTERN = `${CLAUDE_ORIGIN}/*`;

/** Landing page when we need a tab to run the content script in. */
export const CLAUDE_HOME_URL = `${CLAUDE_ORIGIN}/chats`;

/** True when a tab URL belongs to Claude, so the popup can find a host tab. */
export function isClaudeUrl(url: string | undefined): boolean {
  return typeof url === 'string' && url.startsWith(`${CLAUDE_ORIGIN}/`);
}

/**
 * Same-origin GET carrying the user's existing claude.ai session cookies.
 *
 * The method is hard-coded. There is no parameter a caller could use to turn
 * this into a write, which is what makes hard rule 1 structural rather than a
 * convention someone can forget.
 *
 * Verified in the M0 spike: same-origin fetch carries auth with no CSRF header,
 * so the page-world proxy fallback in ARCHITECTURE §2 stays unbuilt.
 */
async function getJson(path: string): Promise<unknown> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await acquireSlot();

    let response: Response;
    try {
      response = await fetch(apiUrl(path), {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    } catch {
      // Network-level failure (offline, DNS, aborted). Retryable.
      if (attempt === MAX_RETRIES) {
        registerFailure();
        throw new AdapterError(`Network request failed for ${path}`, undefined);
      }
      await sleep(backoffDelay(attempt, null));
      continue;
    }

    if (response.ok) {
      consecutiveFailures = 0;
      try {
        return (await response.json()) as unknown;
      } catch {
        registerFailure();
        throw new AdapterError(`Malformed JSON from ${path}`, response.status);
      }
    }

    if (isRetryable(response.status) && attempt < MAX_RETRIES) {
      await sleep(backoffDelay(attempt, response.headers.get('Retry-After')));
      continue;
    }

    registerFailure();
    throw new AdapterError(
      `claude.ai returned ${String(response.status)} for ${path}`,
      response.status,
    );
  }

  registerFailure();
  throw new AdapterError(`Exhausted retries for ${path}`);
}

/**
 * ARCHITECTURE §3 rule 2: hard stop plus degraded mode after 5 consecutive
 * failures. Counting consecutively rather than cumulatively means a single flaky
 * request during a 300-conversation backfill does not poison the run.
 */
function registerFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    setDegraded(`${String(consecutiveFailures)} consecutive request failures`);
  }
}

export function hasHitFailureLimit(): boolean {
  return consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
}

/** Test-only. Module-level throttle state would otherwise leak between cases. */
export function resetAdapterStateForTests(): void {
  nextAllowedRequestAt = 0;
  consecutiveFailures = 0;
}

// ---------------------------------------------------------------------------
// Read operations (the entire public surface; nothing here mutates)
// ---------------------------------------------------------------------------

/** GET /api/organizations */
export async function listOrganizations(): Promise<Organization[]> {
  const raw = await getJson('/organizations');
  return parseArrayLenient(OrganizationSchema, raw).items;
}

/**
 * The org whose capabilities include "chat".
 *
 * Observed in the spike: accounts can carry several orgs, and an api-only org
 * appeared first. Taking [0] would have been wrong about half the time.
 */
export async function getChatOrganization(): Promise<Organization | null> {
  const orgs = await listOrganizations();
  return orgs.find((org) => org.capabilities?.includes('chat')) ?? null;
}

/**
 * GET /api/organizations/{org}/chat_conversations?limit&offset
 *
 * An offset past the end returns 200 with [], which is the pagination
 * terminator. Callers loop until this returns an empty array.
 */
export async function listConversations(
  orgId: string,
  limit = 50,
  offset = 0,
): Promise<ConversationSummary[]> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const raw = await getJson(`/organizations/${orgId}/chat_conversations?${query.toString()}`);
  const { items } = parseArrayLenient(ConversationSummarySchema, raw);
  return items;
}

/** GET /api/organizations/{org}/chat_conversations/{uuid} (detail incl. messages) */
export async function getConversation(
  orgId: string,
  conversationUuid: string,
): Promise<ConversationDetail | null> {
  const query = new URLSearchParams({
    tree: 'True',
    rendering_mode: 'messages',
    render_all_tools: 'true',
  });
  const raw = await getJson(
    `/organizations/${orgId}/chat_conversations/${conversationUuid}?${query.toString()}`,
  );
  return parseLenient(ConversationDetailSchema, raw);
}

/**
 * GET /api/organizations/{org}/usage
 *
 * Authoritative usage, found in the M0 spike: `five_hour` and `seven_day` each
 * carry `utilization` (0-100) and an ISO `resets_at`. This is why M3 needs no
 * client-side estimation. See docs/api-notes.md §5.
 */
export async function getUsage(orgId: string): Promise<Usage | null> {
  const raw = await getJson(`/organizations/${orgId}/usage`);
  return parseLenient(UsageSchema, raw);
}

/**
 * ARCHITECTURE §3 rule 4: runs on startup, fetches one page, and flips to
 * degraded on failure rather than letting the first real sync discover it.
 */
export async function selfTest(): Promise<boolean> {
  try {
    const org = await getChatOrganization();
    if (!org) {
      setDegraded('No organization with chat capability');
      return false;
    }
    await listConversations(org.uuid, 1, 0);
    return true;
  } catch (error) {
    setDegraded(error instanceof Error ? error.message : 'Self-test failed');
    return false;
  }
}

/** Exported for tests that need to assert list-parsing drops bad elements. */
export const schemas = { ConversationListSchema, OrganizationListSchema };
