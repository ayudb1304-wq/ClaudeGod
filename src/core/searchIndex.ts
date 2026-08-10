import MiniSearch, { type Options as MiniSearchOptions } from 'minisearch';
import { getEntitlements } from './entitlements';

/**
 * Full-text search index (FEATURES 2.1, ARCHITECTURE §4).
 *
 * One document per message chunk rather than per conversation. Chunking keeps
 * BM25 scoring meaningful (a 40-message conversation would otherwise dilute
 * every term) and gives us a message to jump to rather than just a chat.
 */

/** Chunk target. ARCHITECTURE §4 says ~1KB fields. */
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;

export interface IndexableMessage {
  index: number;
  uuid: string;
  sender: string;
  text: string;
  createdAt: string | null;
}

export interface IndexableConversation {
  uuid: string;
  title: string;
  updatedAt: string;
  messages: IndexableMessage[];
}

/** A chunk of one message. `id` is deterministic so re-indexing is idempotent. */
export interface SearchDocument {
  id: string;
  convUuid: string;
  title: string;
  messageIndex: number;
  messageUuid: string;
  sender: string;
  text: string;
  updatedAt: string;
  createdAt: string | null;
}

export interface SearchHit {
  convUuid: string;
  title: string;
  messageIndex: number;
  messageUuid: string;
  sender: string;
  /** Text window around the match, for display. */
  snippet: string;
  /** [start, end) offsets within `snippet` to highlight. */
  highlights: [number, number][];
  updatedAt: string;
  score: number;
}

const MINISEARCH_OPTIONS: MiniSearchOptions<SearchDocument> = {
  fields: ['title', 'text'],
  storeFields: [
    'convUuid',
    'title',
    'messageIndex',
    'messageUuid',
    'sender',
    'text',
    'updatedAt',
  ],
  // A title match is a stronger signal than one body mention.
  searchOptions: { boost: { title: 2 }, prefix: true, fuzzy: 0.2 },
};

/**
 * Splits long text on whitespace near the chunk boundary.
 *
 * Overlap exists so a phrase straddling a boundary is still findable; without
 * it, "defensive parsing" split across two chunks matches neither well.
 */
export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (text.length <= size) return text.length > 0 ? [text] : [];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    if (end < text.length) {
      // Prefer a whitespace boundary, but never backtrack more than 15% of the
      // chunk, or a long unbroken string would produce tiny chunks.
      const window = text.slice(start, end);
      const lastSpace = window.lastIndexOf(' ');
      if (lastSpace > size * 0.85) end = start + lastSpace;
    }

    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

export function toSearchDocuments(conversation: IndexableConversation): SearchDocument[] {
  const documents: SearchDocument[] = [];

  for (const message of conversation.messages) {
    const chunks = chunkText(message.text);
    chunks.forEach((chunk, chunkIndex) => {
      documents.push({
        id: `${conversation.uuid}:${String(message.index)}:${String(chunkIndex)}`,
        convUuid: conversation.uuid,
        title: conversation.title,
        messageIndex: message.index,
        messageUuid: message.uuid,
        sender: message.sender,
        text: chunk,
        updatedAt: conversation.updatedAt,
        createdAt: message.createdAt,
      });
    });
  }

  return documents;
}

/**
 * Applies the free-tier cap: the N most recently updated conversations.
 *
 * FEATURES 2.1. Sorting here rather than at query time means the cap is a
 * property of the index, so a free user's search cannot accidentally read
 * beyond it.
 */
export function applyTierCap(
  conversations: IndexableConversation[],
  cap: number | null = getEntitlements().searchConversationCap,
): IndexableConversation[] {
  if (cap === null) return conversations;
  return [...conversations]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, cap);
}

export class SearchIndex {
  private engine: MiniSearch<SearchDocument>;

  constructor() {
    this.engine = new MiniSearch(MINISEARCH_OPTIONS);
  }

  get documentCount(): number {
    return this.engine.documentCount;
  }

  /** Full rebuild. Used after backfill and whenever deserialization fails. */
  build(conversations: IndexableConversation[]): void {
    this.engine = new MiniSearch(MINISEARCH_OPTIONS);
    const documents = conversations.flatMap((conversation) => toSearchDocuments(conversation));
    this.engine.addAll(documents);
  }

  /**
   * Adds or replaces a single conversation.
   *
   * Removes first: a conversation whose messages were edited upstream would
   * otherwise leave orphaned chunks that surface as phantom search results.
   */
  upsert(conversation: IndexableConversation): void {
    this.remove(conversation.uuid);
    this.engine.addAll(toSearchDocuments(conversation));
  }

  remove(convUuid: string): void {
    const stale: SearchDocument[] = [];
    // MiniSearch has no query-by-stored-field, so collect ids by filtering.
    this.engine.search(MiniSearch.wildcard, {
      filter: (result) => {
        if (result.convUuid === convUuid) stale.push(result as unknown as SearchDocument);
        return false;
      },
    });
    for (const document of stale) {
      try {
        this.engine.discard(document.id);
      } catch {
        // Already gone. Removing twice is not an error worth surfacing.
      }
    }
  }

  search(query: string, limit = 30): SearchHit[] {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    return this.engine
      .search(trimmed)
      .slice(0, limit)
      .map((result) => {
        const text = String(result.text ?? '');
        const terms = result.terms;
        const { snippet, highlights } = buildSnippet(text, terms);
        return {
          convUuid: String(result.convUuid),
          title: String(result.title ?? ''),
          messageIndex: Number(result.messageIndex ?? 0),
          messageUuid: String(result.messageUuid ?? ''),
          sender: String(result.sender ?? ''),
          snippet,
          highlights,
          updatedAt: String(result.updatedAt ?? ''),
          score: result.score,
        };
      });
  }

  serialize(): string {
    return JSON.stringify(this.engine);
  }

  /** Returns false when the payload is unusable; caller rebuilds from Dexie. */
  restore(serialized: string): boolean {
    try {
      this.engine = MiniSearch.loadJSON<SearchDocument>(serialized, MINISEARCH_OPTIONS);
      return true;
    } catch {
      this.engine = new MiniSearch(MINISEARCH_OPTIONS);
      return false;
    }
  }
}

const SNIPPET_RADIUS = 90;

/**
 * Builds a display snippet centred on the first matched term.
 *
 * Returns highlight offsets rather than HTML so the renderer stays in control
 * of escaping. Injecting markup here would be an XSS hole fed by conversation
 * text.
 */
export function buildSnippet(
  text: string,
  terms: string[],
): { snippet: string; highlights: [number, number][] } {
  if (terms.length === 0) {
    return { snippet: text.slice(0, SNIPPET_RADIUS * 2), highlights: [] };
  }

  const lower = text.toLowerCase();
  let firstAt = -1;
  for (const term of terms) {
    const at = lower.indexOf(term.toLowerCase());
    if (at !== -1 && (firstAt === -1 || at < firstAt)) firstAt = at;
  }
  if (firstAt === -1) {
    return { snippet: text.slice(0, SNIPPET_RADIUS * 2), highlights: [] };
  }

  const start = Math.max(0, firstAt - SNIPPET_RADIUS);
  const end = Math.min(text.length, firstAt + SNIPPET_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const snippet = prefix + text.slice(start, end) + suffix;

  const highlights: [number, number][] = [];
  const snippetLower = snippet.toLowerCase();
  for (const term of terms) {
    const needle = term.toLowerCase();
    let at = snippetLower.indexOf(needle);
    while (at !== -1) {
      highlights.push([at, at + needle.length]);
      at = snippetLower.indexOf(needle, at + needle.length);
    }
  }
  highlights.sort((a, b) => a[0] - b[0]);

  return { snippet, highlights };
}
