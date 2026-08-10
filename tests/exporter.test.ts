import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type { ArtifactRecord, ConversationRecord, MessageRecord } from '@/core/db';
import {
  artifactExtension,
  conversationFilename,
  conversationToMarkdown,
  exportConversation,
  exportConversationsZip,
  isoDate,
  slugify,
  type ExportBundle,
  type ExportSource,
} from '@/core/exporter';

const NOW = new Date('2026-08-10T12:00:00Z');

function conversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    uuid: 'conv-1',
    title: 'Ship the extension',
    updatedAt: '2026-08-09T10:30:00.000Z',
    createdAt: '2026-08-01T09:00:00.000Z',
    isStarred: false,
    projectUuid: null,
    indexedAt: '2026-08-09T11:00:00.000Z',
    ...overrides,
  };
}

function message(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    convUuid: 'conv-1',
    index: 0,
    uuid: 'msg-0',
    sender: 'human',
    text: 'How do I chunk storage?',
    createdAt: '2026-08-01T09:00:00.000Z',
    hasArtifact: false,
    truncated: false,
    ...overrides,
  };
}

function artifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: 'art-1',
    convUuid: 'conv-1',
    title: 'chunker.ts',
    type: 'application/vnd.ant.code',
    language: 'typescript',
    content: 'export const chunk = 1;\n',
    possiblyStale: false,
    ...overrides,
  };
}

function bundle(overrides: Partial<ExportBundle> = {}): ExportBundle {
  return {
    conversation: conversation(),
    messages: [
      message(),
      message({
        index: 1,
        uuid: 'msg-1',
        sender: 'assistant',
        text: 'Split it:\n\n```ts\nconst parts = split(json);\n```',
        createdAt: '2026-08-01T09:01:00.000Z',
      }),
    ],
    artifacts: [],
    ...overrides,
  };
}

function sourceOf(bundles: ExportBundle[]): ExportSource {
  return {
    listConversationUuids: () => Promise.resolve(bundles.map((entry) => entry.conversation.uuid)),
    loadBundle: (uuid) =>
      Promise.resolve(bundles.find((entry) => entry.conversation.uuid === uuid) ?? null),
  };
}

describe('filenames', () => {
  it('slugifies titles a filesystem would reject', () => {
    expect(slugify('Ship the extension')).toBe('Ship-the-extension');
    expect(slugify('a/b\\c:d*e?"<>|')).toBe('a-b-c-d-e');
    expect(slugify('  ...  ')).toBe('untitled-chat');
    expect(slugify('')).toBe('untitled-chat');
    // Digits and unicode letters survive; only the illegal set is stripped.
    expect(slugify('Q3 2026 røadmap')).toMatch(/^Q3-2026-r/);
    expect(slugify('x'.repeat(200))).toHaveLength(60);
  });

  it('names a conversation file with its updated date', () => {
    expect(conversationFilename(conversation(), NOW)).toBe('Ship-the-extension-2026-08-09.md');
    // A missing or junk date falls back to today rather than failing the export.
    expect(conversationFilename(conversation({ updatedAt: 'nonsense' }), NOW)).toBe(
      'Ship-the-extension-2026-08-10.md',
    );
  });

  it('derives artifact extensions from language, then type', () => {
    expect(artifactExtension(artifact())).toBe('ts');
    expect(artifactExtension(artifact({ language: null, type: 'text/markdown' }))).toBe('md');
    expect(artifactExtension(artifact({ language: null, type: 'application/vnd.ant.react' }))).toBe(
      'jsx',
    );
    expect(artifactExtension(artifact({ language: null, type: null }))).toBe('txt');
  });

  it('formats dates defensively', () => {
    expect(isoDate('2026-08-09T10:30:00.000Z')).toBe('2026-08-09');
    expect(isoDate(null, NOW)).toBe('2026-08-10');
  });
});

describe('markdown', () => {
  it('renders roles, order, and code blocks verbatim', () => {
    const markdown = conversationToMarkdown(bundle());

    expect(markdown).toMatchInlineSnapshot(`
      "# Ship the extension

      _2 messages · started 2026-08-01 · updated 2026-08-09_

      ## You — 2026-08-01 09:00

      How do I chunk storage?

      ## Claude — 2026-08-01 09:01

      Split it:

      \`\`\`ts
      const parts = split(json);
      \`\`\`
      "
    `);
  });

  it('sorts by message index rather than trusting the caller', () => {
    const reversed = bundle();
    const markdown = conversationToMarkdown({
      ...reversed,
      messages: [...reversed.messages].reverse(),
    });
    expect(markdown.indexOf('## You')).toBeLessThan(markdown.indexOf('## Claude'));
  });

  it('inlines artifacts when no separate files exist, and flags stale ones', () => {
    const markdown = conversationToMarkdown(
      bundle({ artifacts: [artifact({ possiblyStale: true })] }),
    );

    expect(markdown).toContain('## Artifacts');
    expect(markdown).toContain('### chunker.ts');
    expect(markdown).toContain('```typescript\nexport const chunk = 1;');
    expect(markdown).toContain('may be out of date');
  });

  it('links artifacts instead of inlining them when paths are supplied', () => {
    const markdown = conversationToMarkdown(bundle({ artifacts: [artifact()] }), {
      artifactPaths: new Map([['art-1', '../artifacts/chat/chunker.ts']]),
    });

    expect(markdown).toContain('### [chunker.ts](../artifacts/chat/chunker.ts)');
    expect(markdown).not.toContain('export const chunk = 1;');
  });

  it('keeps an unknown sender and an empty message visible', () => {
    const markdown = conversationToMarkdown(
      bundle({ messages: [message({ sender: 'tool', text: '', truncated: true })] }),
    );

    expect(markdown).toContain('## tool');
    expect(markdown).toContain('_(no text content)_');
    expect(markdown).toContain('truncated');
  });

  it('escapes nothing but survives fenced content inside artifacts', () => {
    const markdown = conversationToMarkdown(
      bundle({ artifacts: [artifact({ content: '```js\nnested\n```' })] }),
    );
    // A four-backtick fence keeps the nested block from closing ours early.
    expect(markdown).toContain('````typescript');
  });
});

describe('single export', () => {
  it('returns markdown and a filename', async () => {
    const file = await exportConversation('conv-1', sourceOf([bundle()]), NOW);
    expect(file?.filename).toBe('Ship-the-extension-2026-08-09.md');
    expect(file?.mimeType).toBe('text/markdown');
    expect(String(file?.data)).toContain('# Ship the extension');
  });

  it('returns null for a conversation that is not mirrored yet', async () => {
    await expect(exportConversation('missing', sourceOf([bundle()]), NOW)).resolves.toBeNull();
  });
});

describe('bulk ZIP', () => {
  it('writes chats, artifacts, and an index, with relative links between them', async () => {
    const file = await exportConversationsZip(['conv-1'], {
      source: sourceOf([bundle({ artifacts: [artifact()] })]),
      now: NOW,
    });

    expect(file.filename).toBe('claude-chats-2026-08-10.zip');
    const entries = unzipSync(file.data as Uint8Array);
    const paths = Object.keys(entries).sort();

    expect(paths).toEqual([
      'artifacts/Ship-the-extension-2026-08-09/chunker.ts',
      'chats/Ship-the-extension-2026-08-09.md',
      'index.md',
    ]);
    expect(strFromU8(entries['chats/Ship-the-extension-2026-08-09.md'] as Uint8Array)).toContain(
      '(../artifacts/Ship-the-extension-2026-08-09/chunker.ts)',
    );
    expect(strFromU8(entries['index.md'] as Uint8Array)).toContain(
      '[Ship the extension](chats/Ship-the-extension-2026-08-09.md)',
    );
  });

  it('keeps two chats with the same title in separate files', async () => {
    const file = await exportConversationsZip(['conv-1', 'conv-2'], {
      source: sourceOf([
        bundle(),
        bundle({ conversation: conversation({ uuid: 'conv-2' }), messages: [message()] }),
      ]),
      now: NOW,
    });

    const paths = Object.keys(unzipSync(file.data as Uint8Array));
    expect(paths).toContain('chats/Ship-the-extension-2026-08-09.md');
    expect(paths).toContain('chats/Ship-the-extension-2026-08-09-2.md');
  });

  it('reports progress for every conversation and skips ones that are missing', async () => {
    const progress: [number, number][] = [];
    const file = await exportConversationsZip(['conv-1', 'gone'], {
      source: sourceOf([bundle()]),
      onProgress: (done, total) => progress.push([done, total]),
      now: NOW,
    });

    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(Object.keys(unzipSync(file.data as Uint8Array))).toHaveLength(2);
  });

  it('stops early when cancelled', async () => {
    let seen = 0;
    const file = await exportConversationsZip(['conv-1', 'conv-2'], {
      source: sourceOf([bundle(), bundle({ conversation: conversation({ uuid: 'conv-2' }) })]),
      onProgress: () => (seen += 1),
      isCancelled: () => seen >= 1,
      now: NOW,
    });

    expect(seen).toBe(1);
    // What was already exported is still a valid ZIP, not a discarded run.
    expect(Object.keys(unzipSync(file.data as Uint8Array))).toEqual([
      'chats/Ship-the-extension-2026-08-09.md',
      'index.md',
    ]);
  });
});
