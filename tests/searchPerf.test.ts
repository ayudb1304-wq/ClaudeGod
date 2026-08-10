import { describe, expect, it } from 'vitest';
import { SearchIndex, type IndexableConversation } from '@/core/searchIndex';

/**
 * Performance budget (FEATURES 2.1, ARCHITECTURE §8): search must return in
 * under 200ms over 1,000 conversations on a mid-range laptop.
 *
 * The threshold here is deliberately generous relative to the spec, because CI
 * and dev machines vary and a flaky perf test gets deleted rather than fixed.
 * It exists to catch an order-of-magnitude regression, not to certify latency.
 * The real number gets measured on the target machine during the manual pass.
 */

const VOCABULARY = [
  'kubernetes deployment rollout strategy',
  'typescript generics inference narrowing',
  'postgres index scan planner statistics',
  'react hooks dependency array stale closure',
  'rust borrow checker lifetime elision',
  'defensive parsing unstable api shapes',
];

function buildCorpus(count: number): IndexableConversation[] {
  return Array.from({ length: count }, (_, i) => ({
    uuid: `conv-${String(i)}`,
    title: `Conversation ${String(i)} about ${VOCABULARY[i % VOCABULARY.length] ?? ''}`,
    updatedAt: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000000Z`,
    messages: Array.from({ length: 8 }, (_, m) => ({
      index: m,
      uuid: `conv-${String(i)}-m${String(m)}`,
      sender: m % 2 === 0 ? 'human' : 'assistant',
      // ~600 chars per message, so ~5KB per conversation, 8 messages each.
      text: `${VOCABULARY[(i + m) % VOCABULARY.length] ?? ''} ${'context filler '.repeat(38)}`,
      createdAt: '2026-08-01T10:00:00.000000Z',
    })),
  }));
}

describe('search performance', () => {
  it('queries 1,000 conversations well inside the budget', () => {
    const index = new SearchIndex();
    index.build(buildCorpus(1000));

    // Warm up so the first query's lazy work is not charged to the measurement.
    index.search('kubernetes');

    const queries = ['kubernetes', 'borrow checker', 'stale closure', 'defensive parsing'];
    const started = performance.now();
    for (const query of queries) index.search(query);
    const perQuery = (performance.now() - started) / queries.length;

    expect(perQuery).toBeLessThan(200);
  });

  it('indexes 1,000 conversations without pathological slowness', () => {
    const corpus = buildCorpus(1000);
    const index = new SearchIndex();

    const started = performance.now();
    index.build(corpus);
    const elapsed = performance.now() - started;

    expect(index.documentCount).toBeGreaterThan(1000);
    // Backfill indexing runs in the background; this only catches a blow-up.
    expect(elapsed).toBeLessThan(30000);
  });
});
