import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getChatOrganization,
  getConversation,
  getUsage,
  hasHitFailureLimit,
  listConversations,
  resetAdapterStateForTests,
  selfTest,
} from '@/api/claudeAdapter';
import { getSyncStatus, resetSyncStatusForTests } from '@/shared/syncStatus';

/**
 * Adapter tests: lenient parsing over real-shaped fixtures, throttling, backoff
 * on 429/5xx, and the degraded flip after 5 consecutive failures.
 *
 * Timers are faked because the adapter deliberately sleeps ~1s between requests.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Drives fake timers while a promise is pending, so awaited sleeps resolve. */
async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  for (let i = 0; i < 40; i++) {
    await vi.advanceTimersByTimeAsync(5000);
  }
  const result = await settled;
  if (result.ok) return result.value;
  throw result.error;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetAdapterStateForTests();
  resetSyncStatusForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('parsing', () => {
  it('selects the org with chat capability, not the first one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse([
            { uuid: 'api-org', capabilities: ['api'] },
            { uuid: 'chat-org', capabilities: ['chat', 'claude_max'] },
          ]),
        ),
      ),
    );

    const org = await runWithTimers(getChatOrganization());
    expect(org?.uuid).toBe('chat-org');
  });

  it('returns null when no org has chat capability, and degrades on self-test', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse([{ uuid: 'api-org', capabilities: ['api'] }]))),
    );

    const ok = await runWithTimers(selfTest());
    expect(ok).toBe(false);
    expect(getSyncStatus().kind).toBe('degraded');
  });

  it('keeps valid conversations and drops malformed ones in the same page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse([
            { uuid: 'good-1', name: 'A', updated_at: '2026-08-01T10:00:00.000000Z' },
            { name: 'missing uuid' },
            { uuid: 'good-2' },
          ]),
        ),
      ),
    );

    const items = await runWithTimers(listConversations('org', 50, 0));
    // One bad element must not discard the other two.
    expect(items.map((c) => c.uuid)).toEqual(['good-1', 'good-2']);
  });

  it('tolerates unknown and missing fields rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            uuid: 'conv-1',
            brand_new_field_claude_added: true,
            chat_messages: [{ uuid: 'm1', sender: 'human', text: 'hi' }],
          }),
        ),
      ),
    );

    const conv = await runWithTimers(getConversation('org', 'conv-1'));
    expect(conv?.uuid).toBe('conv-1');
    expect(conv?.chat_messages?.[0]?.text).toBe('hi');
  });

  it('parses the usage endpoint that replaces estimation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            five_hour: { utilization: 61, resets_at: '2026-08-10T16:50:00.094759+00:00' },
            seven_day: { utilization: 12, resets_at: '2026-08-14T00:00:00.000000+00:00' },
            tangelo: 'internal codename we ignore',
          }),
        ),
      ),
    );

    const usage = await runWithTimers(getUsage('org'));
    expect(usage?.five_hour?.utilization).toBe(61);
    expect(usage?.seven_day?.resets_at).toContain('2026-08-14');
  });
});

describe('throttle and backoff', () => {
  it('retries 429 and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(jsonResponse([{ uuid: 'ok' }]));
    vi.stubGlobal('fetch', fetchMock);

    const items = await runWithTimers(listConversations('org', 50, 0));
    expect(items[0]?.uuid).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries 5xx and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse([{ uuid: 'ok' }]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(runWithTimers(listConversations('org', 50, 0))).resolves.toHaveLength(1);
  });

  it('does not retry a 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(runWithTimers(listConversations('org', 50, 0))).rejects.toThrow('404');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flips to degraded after 5 consecutive failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', { status: 404 }))),
    );

    for (let i = 0; i < 5; i++) {
      await runWithTimers(listConversations('org', 50, 0)).catch(() => undefined);
    }

    expect(hasHitFailureLimit()).toBe(true);
    expect(getSyncStatus().kind).toBe('degraded');
  });

  it('resets the failure counter after a success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 404 }))
      .mockResolvedValueOnce(jsonResponse([{ uuid: 'ok' }]));
    vi.stubGlobal('fetch', fetchMock);

    await runWithTimers(listConversations('org', 50, 0)).catch(() => undefined);
    await runWithTimers(listConversations('org', 50, 0));

    expect(hasHitFailureLimit()).toBe(false);
  });

  it('sends only GET requests', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(jsonResponse([])),
    );
    vi.stubGlobal('fetch', fetchMock);

    await runWithTimers(listConversations('org', 50, 0));

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('include');
  });
});
