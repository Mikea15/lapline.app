import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { fitFilesStore } from '../stores.svelte';
import type { StoredFitFile } from '../types';

beforeEach(async () => {
  await db.delete({ disableAutoOpen: false });
  vi.restoreAllMocks();
});

describe('fitFilesStore.load', () => {
  it('is empty with no stored files', async () => {
    await fitFilesStore.load();
    expect(fitFilesStore.count).toBe(0);
    expect(fitFilesStore.totalBytes).toBe(0);
    expect(fitFilesStore.lastImportedAt).toBeNull();
  });

  it('counts the files, adds up their size and finds the latest import, without listing them', async () => {
    await db.fitFiles.bulkAdd([
      { filename: 'a.fit', size: 100, importedAt: '2026-09-02T10:00:00.000Z' },
      { filename: 'b.fit', size: 250, importedAt: '2026-09-05T08:00:00.000Z' },
      { filename: 'c.gpx', size: 50, importedAt: '2026-09-03T12:00:00.000Z' }
    ] as StoredFitFile[]);
    const toArray = vi.spyOn(db.fitFiles, 'toArray');

    await fitFilesStore.load();

    expect(fitFilesStore.count).toBe(3);
    expect(fitFilesStore.totalBytes).toBe(400);
    expect(fitFilesStore.lastImportedAt).toBe('2026-09-05T08:00:00.000Z');
    expect(toArray).not.toHaveBeenCalled();
  });
});
