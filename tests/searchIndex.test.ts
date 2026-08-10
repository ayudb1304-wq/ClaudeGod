import { beforeEach, describe, expect, it } from 'vitest';
import {
  SearchIndex,
  applyTierCap,
  buildSnippet,
  chunkText,
  toSearchDocuments,
  type IndexableConversation,
} from '@/core/searchIndex';
import { resetEntitlementsForTests, setPro } from '@/core/entitlements';

function conversation(
  uuid: string,
  title: string,
  texts: string[],
  updatedAt = '2026-08-01T10:00:00.000000Z',
): IndexableConversation {
  return {
    uuid,
    title,
    updatedAt,
    messages: texts.map((text, i) => ({
      index: i,
      uuid: `${uuid}-m${String(i)}`,
      sender: i % 2 === 0 ? 'human' : 'assistant',
      text,
      createdAt: updatedAt,
    })),
  };
}

beforeEach(() => {
  resetEntitlementsForTests();
});

describe('chunkText', () => {
  it('leaves short text as a single chunk', () => {
    expect(chunkText('hello world')).toEqual(['hello world']);
  });

  it('drops empty text', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('splits long text into overlapping chunks', () => {
    const text = 'word '.repeat(600); // ~3000 chars
    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(1000);
  });

  it('keeps a phrase findable across a chunk boundary via overlap', () => {
    const filler = 'a'.repeat(980);
    const chunks = chunkText(`${filler} defensive parsing matters`);
    // The overlap means the phrase survives intact in at least one chunk.
    expect(chunks.some((chunk) => chunk.includes('defensive parsing'))).toBe(true);
  });

  it('does not loop forever on unbroken text', () => {
    const chunks = chunkText('x'.repeat(5000));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('').length).toBeGreaterThan(0);
  });
});

describe('toSearchDocuments', () => {
  it('generates deterministic ids so re-indexing is idempotent', () => {
    const conv = conversation('c1', 'Title', ['hello']);
    expect(toSearchDocuments(conv)[0]?.id).toBe('c1:0:0');
    expect(toSearchDocuments(conv)).toEqual(toSearchDocuments(conv));
  });
});

describe('SearchIndex', () => {
  it('finds a conversation by message body, not just title', () => {
    const index = new SearchIndex();
    index.build([conversation('c1', 'Unrelated title', ['the mitochondria is the powerhouse'])]);

    const hits = index.search('mitochondria');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.convUuid).toBe('c1');
  });

  it('ranks a title match above a body-only match', () => {
    const index = new SearchIndex();
    index.build([
      conversation('body', 'Something else', ['we discussed kubernetes at length']),
      conversation('title', 'Kubernetes notes', ['unrelated content here']),
    ]);

    expect(index.search('kubernetes')[0]?.convUuid).toBe('title');
  });

  it('returns the matched message index for jump-to-message', () => {
    const index = new SearchIndex();
    index.build([conversation('c1', 'Chat', ['first message', 'second has zebra'])]);

    const hit = index.search('zebra')[0];
    expect(hit?.messageIndex).toBe(1);
    expect(hit?.messageUuid).toBe('c1-m1');
  });

  it('returns nothing for an empty query rather than everything', () => {
    const index = new SearchIndex();
    index.build([conversation('c1', 'Chat', ['content'])]);

    expect(index.search('')).toEqual([]);
    expect(index.search('   ')).toEqual([]);
  });

  it('upsert replaces old chunks instead of leaving phantoms', () => {
    const index = new SearchIndex();
    index.build([conversation('c1', 'Chat', ['original walrus text'])]);
    expect(index.search('walrus')).toHaveLength(1);

    index.upsert(conversation('c1', 'Chat', ['rewritten content']));

    expect(index.search('walrus')).toEqual([]);
    expect(index.search('rewritten')).toHaveLength(1);
  });

  it('remove drops every chunk of a conversation', () => {
    const index = new SearchIndex();
    index.build([conversation('c1', 'Chat', ['alpha', 'beta']), conversation('c2', 'Other', ['alpha'])]);

    index.remove('c1');

    const hits = index.search('alpha');
    expect(hits.map((h) => h.convUuid)).toEqual(['c2']);
  });

  it('round-trips through serialize and restore', () => {
    const index = new SearchIndex();
    index.build([conversation('c1', 'Chat', ['serialized content here'])]);
    const payload = index.serialize();

    const restored = new SearchIndex();
    expect(restored.restore(payload)).toBe(true);
    expect(restored.search('serialized')).toHaveLength(1);
  });

  it('reports failure on a corrupt payload instead of throwing', () => {
    const index = new SearchIndex();
    expect(index.restore('{not valid json')).toBe(false);
    expect(index.search('anything')).toEqual([]);
  });
});

describe('applyTierCap', () => {
  const conversations = Array.from({ length: 150 }, (_, i) =>
    conversation(`c${String(i)}`, `Chat ${String(i)}`, ['text'], `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000000Z`),
  );

  it('caps free users to the most recent conversations', () => {
    const capped = applyTierCap(conversations);
    expect(capped).toHaveLength(100);
  });

  it('keeps the newest, not an arbitrary 100', () => {
    const capped = applyTierCap(conversations);
    const newest = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    expect(capped[0]?.uuid).toBe(newest?.uuid);
  });

  it('does not cap Pro users', () => {
    setPro(true);
    expect(applyTierCap(conversations)).toHaveLength(150);
  });
});

describe('buildSnippet', () => {
  it('centres the window on the first match', () => {
    const text = `${'filler '.repeat(60)}needle${' filler'.repeat(60)}`;
    const { snippet, highlights } = buildSnippet(text, ['needle']);

    expect(snippet).toContain('needle');
    expect(snippet.length).toBeLessThan(text.length);
    expect(highlights.length).toBeGreaterThan(0);
  });

  it('marks ellipsis only where text was actually cut', () => {
    const { snippet } = buildSnippet('short needle text', ['needle']);
    expect(snippet.startsWith('…')).toBe(false);
    expect(snippet.endsWith('…')).toBe(false);
  });

  it('returns offsets rather than HTML, so conversation text cannot inject markup', () => {
    const { snippet, highlights } = buildSnippet('<img src=x onerror=alert(1)> needle', ['needle']);
    expect(snippet).toContain('<img');
    expect(Array.isArray(highlights[0])).toBe(true);
    expect(typeof highlights[0]?.[0]).toBe('number');
  });

  it('handles a term that survived stemming but is absent verbatim', () => {
    const { snippet, highlights } = buildSnippet('running quickly', ['zzz']);
    expect(snippet).toBe('running quickly');
    expect(highlights).toEqual([]);
  });
});
