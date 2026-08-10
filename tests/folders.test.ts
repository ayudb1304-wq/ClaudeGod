import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addConversationToFolder,
  createFolder,
  deleteFolder,
  FolderLimitError,
  foldersContaining,
  getFolders,
  isFolderLimitReached,
  loadFolders,
  MAX_FOLDER_NAME_LENGTH,
  narrowFolders,
  removeConversationFromFolder,
  renameFolder,
  resetFoldersForTests,
  setFolderColor,
  subscribeFolders,
} from '@/core/folders';
import { resetEntitlementsForTests, setPro } from '@/core/entitlements';
import { getSyncChunked } from '@/shared/storage';
import { createSyncStorageMock } from './helpers/chromeStorage';

const storage = createSyncStorageMock();

beforeEach(() => {
  storage.install();
  resetFoldersForTests();
  resetEntitlementsForTests();
});

afterEach(() => {
  storage.uninstall();
  resetEntitlementsForTests();
});

describe('folder CRUD', () => {
  it('creates, renames, recolours, and persists to sync storage', async () => {
    const folder = await createFolder('  Work notes  ');
    expect(folder.name).toBe('Work notes');

    await renameFolder(folder.id, 'Research');
    await setFolderColor(folder.id, '#5aa17f');

    const stored = await getSyncChunked<unknown>('folders');
    expect(narrowFolders(stored)).toEqual([
      expect.objectContaining({ id: folder.id, name: 'Research', color: '#5aa17f' }),
    ]);
  });

  it('caps the name length and falls back for an empty name', async () => {
    const folder = await createFolder('n'.repeat(200));
    expect(folder.name).toHaveLength(MAX_FOLDER_NAME_LENGTH);

    const blank = await createFolder('   ');
    expect(blank.name).toBe('New folder');

    // An empty rename is a slip, not an instruction to blank the label.
    await renameFolder(folder.id, '  ');
    expect(getFolders()[0]?.name).toHaveLength(MAX_FOLDER_NAME_LENGTH);
  });

  it('deleting a folder forgets the grouping only', async () => {
    const folder = await createFolder('Work');
    await addConversationToFolder(folder.id, 'conv-1');
    const keep = await createFolder('Keep');
    await addConversationToFolder(keep.id, 'conv-1');

    await deleteFolder(folder.id);

    expect(getFolders()).toHaveLength(1);
    expect(foldersContaining('conv-1')).toEqual([expect.objectContaining({ id: keep.id })]);
  });

  it('ignores mutations for unknown folder ids', async () => {
    await createFolder('Work');
    await renameFolder('missing', 'Nope');
    await deleteFolder('missing');
    await addConversationToFolder('missing', 'conv-1');

    expect(getFolders()).toHaveLength(1);
  });
});

describe('membership', () => {
  it('allows a conversation in several folders and dedupes repeat drops', async () => {
    const work = await createFolder('Work');
    const ideas = await createFolder('Ideas');

    await addConversationToFolder(work.id, 'conv-1');
    await addConversationToFolder(ideas.id, 'conv-1');
    await addConversationToFolder(work.id, 'conv-1');

    expect(getFolders()[0]?.convIds).toEqual(['conv-1']);
    expect(foldersContaining('conv-1').map((folder) => folder.id)).toEqual([work.id, ideas.id]);
  });

  it('adds most recent first and removes cleanly', async () => {
    const work = await createFolder('Work');
    await addConversationToFolder(work.id, 'conv-1');
    await addConversationToFolder(work.id, 'conv-2');
    expect(getFolders()[0]?.convIds).toEqual(['conv-2', 'conv-1']);

    await removeConversationFromFolder(work.id, 'conv-1');
    expect(getFolders()[0]?.convIds).toEqual(['conv-2']);
  });
});

describe('tier gating', () => {
  it('stops the free tier at three folders and lifts the cap for Pro', async () => {
    await createFolder('One');
    await createFolder('Two');
    await createFolder('Three');

    expect(isFolderLimitReached()).toBe(true);
    await expect(createFolder('Four')).rejects.toBeInstanceOf(FolderLimitError);

    setPro(true);
    expect(isFolderLimitReached()).toBe(false);
    await expect(createFolder('Four')).resolves.toBeDefined();
  });
});

describe('reads', () => {
  it('survives junk in storage', async () => {
    storage.data['folders'] = { chunkCount: 1 };
    storage.data['folders__0'] = JSON.stringify([
      { id: 'good', name: 'Work', color: '#fff', convIds: ['a', 'a', 'b', 7], createdAt: 'x' },
      { name: 'no id' },
      'nonsense',
      null,
    ]);

    const folders = await loadFolders();
    expect(folders).toEqual([
      { id: 'good', name: 'Work', color: '#fff', convIds: ['a', 'b'], createdAt: 'x' },
    ]);
  });

  it('reports an empty list rather than throwing when storage fails', async () => {
    globalThis.chrome = {
      storage: { sync: { get: () => Promise.reject(new Error('sync is throttled')) } },
    } as unknown as typeof chrome;

    await expect(loadFolders()).resolves.toEqual([]);
  });

  it('notifies subscribers on load and on change', async () => {
    await loadFolders();
    const seen: number[] = [];
    subscribeFolders((folders) => seen.push(folders.length));

    await createFolder('Work');
    await createFolder('Ideas');

    expect(seen).toEqual([0, 1, 2]);
  });
});
