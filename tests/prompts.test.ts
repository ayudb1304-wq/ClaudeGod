import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createPrompt,
  deletePrompt,
  fillVariables,
  filterPrompts,
  getPrompts,
  isPromptLimitReached,
  loadPrompts,
  MAX_PROMPT_TITLE_LENGTH,
  narrowPrompts,
  parseVariables,
  PromptLimitError,
  resetPromptsForTests,
  updatePrompt,
  type Prompt,
} from '@/core/prompts';
import { resetEntitlementsForTests, setPro } from '@/core/entitlements';
import { getSyncChunked } from '@/shared/storage';
import { createSyncStorageMock } from './helpers/chromeStorage';

const storage = createSyncStorageMock();

beforeEach(() => {
  storage.install();
  resetPromptsForTests();
  resetEntitlementsForTests();
});

afterEach(() => {
  storage.uninstall();
  resetEntitlementsForTests();
});

function promptFixture(overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: 'p1',
    title: 'Code review',
    body: 'Review this code',
    category: 'work',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('prompt CRUD', () => {
  it('creates, edits, deletes, and persists', async () => {
    const prompt = await createPrompt({
      title: ' Summarise ',
      body: 'Summarise this',
      category: ' work ',
    });
    expect(prompt).toMatchObject({ title: 'Summarise', category: 'work' });

    await updatePrompt(prompt.id, { title: 'Summarise thread', body: 'Summarise the thread' });
    expect(narrowPrompts(await getSyncChunked('prompts'))).toEqual([
      expect.objectContaining({ title: 'Summarise thread', body: 'Summarise the thread' }),
    ]);

    await deletePrompt(prompt.id);
    expect(getPrompts()).toEqual([]);
  });

  it('trims oversized titles and names an untitled prompt', async () => {
    const prompt = await createPrompt({ title: 't'.repeat(500), body: 'x' });
    expect(prompt.title).toHaveLength(MAX_PROMPT_TITLE_LENGTH);

    const untitled = await createPrompt({ title: '  ', body: 'x' });
    expect(untitled.title).toBe('Untitled prompt');
  });

  it('ignores edits and deletes for unknown ids', async () => {
    await createPrompt({ title: 'One', body: 'x' });
    await updatePrompt('missing', { title: 'Nope', body: 'y' });
    await deletePrompt('missing');

    expect(getPrompts()).toHaveLength(1);
  });

  it('caps the free tier at ten prompts and lifts the cap for Pro', async () => {
    for (let index = 0; index < 10; index += 1) {
      await createPrompt({ title: `P${String(index)}`, body: 'x' });
    }

    expect(isPromptLimitReached()).toBe(true);
    await expect(createPrompt({ title: 'Eleven', body: 'x' })).rejects.toBeInstanceOf(
      PromptLimitError,
    );

    setPro(true);
    await expect(createPrompt({ title: 'Eleven', body: 'x' })).resolves.toBeDefined();
  });

  it('survives junk in storage', async () => {
    storage.data['prompts'] = { chunkCount: 1 };
    storage.data['prompts__0'] = JSON.stringify([{ id: 'ok' }, { title: 'no id' }, 42]);

    await expect(loadPrompts()).resolves.toEqual([
      { id: 'ok', title: '', body: '', category: '', createdAt: '', updatedAt: '' },
    ]);
  });
});

describe('variables', () => {
  it('collects placeholder names once, in order', () => {
    expect(parseVariables('Hi {{name}}, about {{ topic }} — {{name}} again')).toEqual([
      'name',
      'topic',
    ]);
    expect(parseVariables('no placeholders here')).toEqual([]);
  });

  it('substitutes provided values and leaves the rest visible', () => {
    const body = 'Review {{file}} for {{concern}}';
    expect(fillVariables(body, { file: 'db.ts', concern: 'races' })).toBe('Review db.ts for races');
    // A skipped value stays as a placeholder so the user can see what is missing.
    expect(fillVariables(body, { file: 'db.ts' })).toBe('Review db.ts for {{concern}}');
    expect(fillVariables(body, { file: 'db.ts', concern: '' })).toBe(
      'Review db.ts for {{concern}}',
    );
  });
});

describe('picker filtering', () => {
  const prompts = [
    promptFixture({ id: 'a', title: 'Review code', body: 'body' }),
    promptFixture({ id: 'b', title: 'Deep review', body: 'body' }),
    promptFixture({ id: 'c', title: 'Summarise', body: 'please review carefully', category: '' }),
    promptFixture({ id: 'd', title: 'Unrelated', body: 'nothing', category: '' }),
  ];

  it('ranks title prefix above title contains above body', () => {
    expect(filterPrompts(prompts, 'review').map((prompt) => prompt.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns everything for an empty query', () => {
    expect(filterPrompts(prompts, '  ')).toHaveLength(4);
  });
});
