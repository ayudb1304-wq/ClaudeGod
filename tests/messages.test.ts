import { describe, expect, it } from 'vitest';
import { isExtensionMessage } from '@/shared/messages';
import { isClaudeUrl, CLAUDE_TAB_PATTERN } from '@/api/claudeAdapter';

/**
 * The message guard is a trust boundary: `chrome.runtime.onMessage` receives
 * anything any extension page sends, so the content script must reject
 * unrecognised shapes rather than switch on them.
 */
describe('isExtensionMessage', () => {
  it('accepts the two known commands', () => {
    expect(isExtensionMessage({ type: 'START_SYNC' })).toBe(true);
    expect(isExtensionMessage({ type: 'GET_SYNC_STATE' })).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'START_SYNC'],
    ['a number', 42],
    ['an object with no type', { cmd: 'START_SYNC' }],
    ['an unknown type', { type: 'DELETE_EVERYTHING' }],
    ['a non-string type', { type: 7 }],
  ])('rejects %s', (_label, value) => {
    expect(isExtensionMessage(value)).toBe(false);
  });
});

describe('claude tab matching', () => {
  it('matches real claude.ai tab urls', () => {
    expect(isClaudeUrl('https://claude.ai/chats')).toBe(true);
    expect(isClaudeUrl('https://claude.ai/chat/abc-123')).toBe(true);
  });

  it('does not match lookalike hosts', () => {
    // The trailing slash in the origin check is what stops these.
    expect(isClaudeUrl('https://claude.ai.evil.com/chats')).toBe(false);
    expect(isClaudeUrl('https://notclaude.ai/chats')).toBe(false);
    expect(isClaudeUrl('http://claude.ai/chats')).toBe(false);
    expect(isClaudeUrl(undefined)).toBe(false);
  });

  it('exposes a tab pattern matching the frozen host permission', () => {
    expect(CLAUDE_TAB_PATTERN).toBe('https://claude.ai/*');
  });
});
