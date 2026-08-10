/**
 * Minimal chrome.storage.sync stand-in for the folders/prompts/chunking tests.
 *
 * Enforces the real per-item quota, because that limit is exactly what the
 * chunking code exists to respect — a mock with unlimited item size would let
 * a broken splitter pass every test.
 */

export const QUOTA_BYTES_PER_ITEM = 8192;

type ChangeListener = (changes: Record<string, unknown>, area: string) => void;

export interface StorageMock {
  data: Record<string, unknown>;
  listeners: Set<ChangeListener>;
  install(): void;
  uninstall(): void;
}

export function createSyncStorageMock(): StorageMock {
  const data: Record<string, unknown> = {};
  const listeners = new Set<ChangeListener>();

  function read(query: string | string[] | null): Record<string, unknown> {
    if (query === null) return { ...data };
    const keys = typeof query === 'string' ? [query] : query;
    const result: Record<string, unknown> = {};
    for (const key of keys) result[key] = data[key];
    return result;
  }

  const sync = {
    get: (query: string | string[] | null) => Promise.resolve(read(query)),
    set: (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        const size = new TextEncoder().encode(key + JSON.stringify(value)).length;
        if (size > QUOTA_BYTES_PER_ITEM) {
          return Promise.reject(new Error('QUOTA_BYTES_PER_ITEM quota exceeded'));
        }
      }
      Object.assign(data, items);
      const changes = Object.fromEntries(
        Object.entries(items).map(([key, value]) => [key, { newValue: value }]),
      );
      for (const listener of listeners) listener(changes, 'sync');
      return Promise.resolve();
    },
    remove: (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete data[key];
      return Promise.resolve();
    },
    clear: () => {
      for (const key of Object.keys(data)) delete data[key];
      return Promise.resolve();
    },
  };

  return {
    data,
    listeners,
    install() {
      globalThis.chrome = {
        storage: {
          sync,
          local: sync,
          onChanged: {
            addListener: (listener: ChangeListener) => listeners.add(listener),
            removeListener: (listener: ChangeListener) => listeners.delete(listener),
          },
        },
      } as unknown as typeof chrome;
    },
    uninstall() {
      // @ts-expect-error test cleanup of the global mock
      delete globalThis.chrome;
      listeners.clear();
      for (const key of Object.keys(data)) delete data[key];
    },
  };
}
