import { describe, expect, it } from 'vitest';
import { extractArtifacts } from '@/core/artifacts';
import type { Message } from '@/api/types';

/**
 * Artifact extraction (docs/api-notes.md §4).
 *
 * The failure this guards against: bulk export emitting one file per edit
 * because artifact versions were not folded down to a single record.
 */

function toolUse(input: Record<string, unknown>): Message {
  return {
    uuid: `m-${String(Math.random())}`,
    content: [{ type: 'tool_use', name: 'artifacts', input }],
  };
}

describe('extractArtifacts', () => {
  it('folds create plus rewrite into one record with the latest body', () => {
    const messages: Message[] = [
      toolUse({ id: 'art-1', command: 'create', title: 'Draft', type: 'text/markdown', content: 'v1' }),
      toolUse({ id: 'art-1', command: 'rewrite', title: 'Draft', content: 'v2' }),
    ];

    const artifacts = extractArtifacts('conv-1', messages);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.content).toBe('v2');
    expect(artifacts[0]?.possiblyStale).toBe(false);
  });

  it('keeps distinct artifacts separate', () => {
    const messages: Message[] = [
      toolUse({ id: 'art-1', command: 'create', content: 'one' }),
      toolUse({ id: 'art-2', command: 'create', content: 'two' }),
    ];

    expect(extractArtifacts('conv-1', messages)).toHaveLength(2);
  });

  it('flags an artifact whose last change was a partial update', () => {
    // `update` carries a fragment, not the whole body, so the stored snapshot is
    // the earlier full one and must not be presented as definitely current.
    const messages: Message[] = [
      toolUse({ id: 'art-1', command: 'create', content: 'full body' }),
      toolUse({ id: 'art-1', command: 'update', old_str: 'full', new_str: 'complete' }),
    ];

    const [artifact] = extractArtifacts('conv-1', messages);

    expect(artifact?.content).toBe('full body');
    expect(artifact?.possiblyStale).toBe(true);
  });

  it('still records an update that has no preceding snapshot', () => {
    const messages: Message[] = [toolUse({ id: 'art-1', command: 'update', new_str: 'x' })];

    const [artifact] = extractArtifacts('conv-1', messages);

    expect(artifact?.id).toBe('art-1');
    expect(artifact?.possiblyStale).toBe(true);
  });

  it('ignores non-artifact tool_use blocks and other content types', () => {
    const messages: Message[] = [
      { uuid: 'm1', content: [{ type: 'text', text: 'hello' }] },
      { uuid: 'm2', content: [{ type: 'thinking', text: 'hmm' }] },
      { uuid: 'm3', content: [{ type: 'tool_use', name: 'repl', input: { id: 'x' } }] },
      { uuid: 'm4', content: [{ type: 'tool_result', text: 'done' }] },
    ];

    expect(extractArtifacts('conv-1', messages)).toEqual([]);
  });

  it('skips artifact blocks with no id rather than throwing', () => {
    const messages: Message[] = [toolUse({ command: 'create', content: 'orphan' })];
    expect(extractArtifacts('conv-1', messages)).toEqual([]);
  });

  it('handles messages with no content array', () => {
    expect(extractArtifacts('conv-1', [{ uuid: 'm1' }])).toEqual([]);
  });
});
