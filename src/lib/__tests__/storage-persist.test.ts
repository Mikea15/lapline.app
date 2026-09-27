import { describe, it, expect, vi } from 'vitest';
import { requestPersistentStorage } from '../storage-persist';

function storage(persisted: boolean, grant: boolean) {
  return {
    persisted: vi.fn(async () => persisted),
    persist: vi.fn(async () => grant)
  } as unknown as StorageManager & { persisted: ReturnType<typeof vi.fn>; persist: ReturnType<typeof vi.fn> };
}

describe('requestPersistentStorage', () => {
  it('reports unsupported when there is no StorageManager', async () => {
    expect(await requestPersistentStorage(undefined)).toBe('unsupported');
  });

  it('reports unsupported when persist() is missing', async () => {
    expect(await requestPersistentStorage({} as StorageManager)).toBe('unsupported');
  });

  it('does not re-request when storage is already persisted', async () => {
    const s = storage(true, true);
    expect(await requestPersistentStorage(s)).toBe('already-persisted');
    expect(s.persist).not.toHaveBeenCalled();
  });

  it('requests persistence and reports a grant', async () => {
    const s = storage(false, true);
    expect(await requestPersistentStorage(s)).toBe('granted');
    expect(s.persist).toHaveBeenCalledOnce();
  });

  it('reports a denial', async () => {
    expect(await requestPersistentStorage(storage(false, false))).toBe('denied');
  });

  it('treats a throwing StorageManager as unsupported', async () => {
    const s = { persisted: async () => false, persist: async () => { throw new Error('nope'); } } as unknown as StorageManager;
    expect(await requestPersistentStorage(s)).toBe('unsupported');
  });
});
