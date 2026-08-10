import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_DRAG_TYPE,
  conversationUuidFromUrl,
  looksLikeConversationDrag,
  readConversationUuid,
} from '@/content/dragData';
import { conversationUuidFromPath } from '@/content/sidebarDrag';
import { readSlashQuery } from '@/content/promptInsert';

/** Stands in for a DataTransfer, which only exists in a browser. */
function transferOf(data: Record<string, string>): DataTransfer {
  return {
    types: Object.keys(data),
    getData: (type: string) => data[type] ?? '',
  } as unknown as DataTransfer;
}

describe('conversation drags', () => {
  it('pulls a uuid out of the URL forms a dragged link carries', () => {
    const uuid = '0f4b2a3c-1111-2222-3333-444455556666';
    expect(conversationUuidFromUrl(`https://claude.ai/chat/${uuid}`)).toBe(uuid);
    expect(conversationUuidFromUrl(`/chat/${uuid}?from=sidebar`)).toBe(uuid);
    expect(conversationUuidFromUrl('https://claude.ai/projects/abc')).toBeNull();
    expect(conversationUuidFromUrl('')).toBeNull();
  });

  it('prefers our own payload over URL parsing', () => {
    const transfer = transferOf({
      [CONVERSATION_DRAG_TYPE]: 'from-search',
      'text/plain': 'https://claude.ai/chat/from-url-aaaaaaaaaaaaaaaa',
    });

    expect(readConversationUuid(transfer)).toBe('from-search');
  });

  it('reads Claude sidebar drags from uri-list or plain text', () => {
    const uuid = '0f4b2a3c-1111-2222-3333-444455556666';
    expect(
      readConversationUuid(transferOf({ 'text/uri-list': `https://claude.ai/chat/${uuid}` })),
    ).toBe(uuid);
    expect(
      readConversationUuid(transferOf({ 'text/plain': `https://claude.ai/chat/${uuid}` })),
    ).toBe(uuid);
  });

  it('returns null for drags that carry no conversation', () => {
    expect(readConversationUuid(transferOf({ 'text/plain': 'just some words' }))).toBeNull();
    expect(readConversationUuid(transferOf({ 'text/html': '<b>hi</b>' }))).toBeNull();
    expect(readConversationUuid(null)).toBeNull();
  });

  it('decides the hover affordance from types alone, as dragover requires', () => {
    // getData is deliberately empty during dragover, so this is all we have.
    expect(looksLikeConversationDrag([CONVERSATION_DRAG_TYPE])).toBe(true);
    expect(looksLikeConversationDrag(['text/uri-list'])).toBe(true);
    expect(looksLikeConversationDrag(['Files'])).toBe(false);
    expect(looksLikeConversationDrag([])).toBe(false);
  });
});

describe('sidebar pointer drags', () => {
  // Claude sets draggable="false" on their chat links, so the only signal is
  // the link itself somewhere in the pointer event's composed path.
  const linkTo = (href: string): EventTarget =>
    ({ getAttribute: (name: string) => (name === 'href' ? href : null) }) as unknown as EventTarget;
  const plain = (): EventTarget => ({}) as EventTarget;

  it('finds the conversation link anywhere in the composed path', () => {
    const uuid = '0f4b2a3c-1111-2222-3333-444455556666';
    expect(conversationUuidFromPath([plain(), linkTo(`/chat/${uuid}`), plain()])).toBe(uuid);
  });

  it('ignores paths with no conversation link', () => {
    expect(conversationUuidFromPath([plain(), linkTo('/projects/abc')])).toBeNull();
    expect(conversationUuidFromPath([])).toBeNull();
  });
});

describe('slash query detection', () => {
  it('fires only when the slash is all the composer holds', () => {
    expect(readSlashQuery('/')).toBe('');
    expect(readSlashQuery('/rev')).toBe('rev');
    expect(readSlashQuery('  /rev')).toBe('rev');
    expect(readSlashQuery('/code review please')).toBe('code review please');
  });

  it('stays silent mid-sentence, in code, and across lines', () => {
    expect(readSlashQuery('what about a/b testing')).toBeNull();
    expect(readSlashQuery('const p = "a/b"')).toBeNull();
    expect(readSlashQuery('/first\nsecond line')).toBeNull();
    expect(readSlashQuery('')).toBeNull();
  });
});
