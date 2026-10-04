import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { backupStore, importStore } from '../stores.svelte';
import { MAX_IMPORT_FILE_BYTES, MAX_ZIP_BYTES, failureMessage } from '../import-failure';
import { ZIP_TOO_LARGE_MESSAGE } from '../backup';

// The real import path, with the parse workers running in-process.
vi.mock('../fit-parse-pool', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../fit-parse-pool')>();
  const { createInProcessWorker } = await import('./in-process-worker');
  return { ...actual, createFitParsePool: (n: number) => actual.createFitParsePool(n, { createWorker: createInProcessWorker }) };
});

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../../../test-fixtures/${name}`, import.meta.url)));
const gpx = fixture('gpx-run-1.gpx');
const gpxFile = () => new File([gpx], 'gpx-run-1.gpx');

beforeEach(async () => {
  await db.delete({ disableAutoOpen: false });
  importStore.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('importStore.importFiles', () => {
  it('stores the file and its activities together', async () => {
    await importStore.importFiles([gpxFile()]);
    expect(importStore.state.result?.errors).toEqual([]);
    expect(await db.fitFiles.count()).toBe(1);
    expect(await db.fitFileBlobs.count()).toBe(1);
    expect(await db.activities.count()).toBeGreaterThan(0);
    expect(await db.activityRecords.count()).toBeGreaterThan(0);
  });

  it('leaves no stored file behind when saving the activities fails', async () => {
    vi.spyOn(db.activityRecords, 'bulkAdd').mockRejectedValue(new Error('disk full'));

    await importStore.importFiles([gpxFile()]);

    expect(importStore.state.files[0]!.status).toBe('error');
    expect(importStore.state.result?.errors).toHaveLength(1);
    expect(await db.fitFiles.count()).toBe(0);
    expect(await db.fitFileBlobs.count()).toBe(0);
    expect(await db.activities.count()).toBe(0);
  });

  it('imports .fit files through the same pool', async () => {
    await importStore.importFiles([new File([fixture('run-easy.fit')], 'run.fit')]);
    expect(importStore.state.result?.errors).toEqual([]);
    expect(importStore.state.result?.imported).toBeGreaterThan(0);
  });

  it('turns away a file over the size limit without reading it', async () => {
    const huge = new File([gpx], 'huge.gpx');
    Object.defineProperty(huge, 'size', { value: MAX_IMPORT_FILE_BYTES + 1 });
    const read = vi.spyOn(huge, 'arrayBuffer');

    await importStore.importFiles([huge, gpxFile()]);

    expect(read).not.toHaveBeenCalled();
    expect(importStore.state.files[0]).toMatchObject({ status: 'error', message: failureMessage('too_large') });
    expect(importStore.state.files[1]!.status).toBe('done');
    expect(importStore.state.result?.errors).toEqual([`huge.gpx: ${failureMessage('too_large')}`]);
  });

  it('lists files rejected before import as failed', async () => {
    await importStore.importFiles([gpxFile()], [{ name: 'big.fit', reason: 'zip_too_large' }]);
    expect(importStore.state.files.map((f) => [f.name, f.status])).toEqual([
      ['gpx-run-1.gpx', 'done'],
      ['big.fit', 'error']
    ]);
    expect(importStore.state.result?.files).toBe(1);
    expect(importStore.state.result?.errors).toEqual([`big.fit: ${failureMessage('zip_too_large')}`]);
  });

  it('refuses a .zip over the size limit without reading it', async () => {
    const zip = new File([new Uint8Array(4)], 'export.zip');
    Object.defineProperty(zip, 'size', { value: MAX_ZIP_BYTES + 1 });
    const read = vi.spyOn(zip, 'arrayBuffer');
    await expect(backupStore.restore(zip)).rejects.toThrow(ZIP_TOO_LARGE_MESSAGE);
    expect(read).not.toHaveBeenCalled();
  });

  it('reads at most a few files at once', async () => {
    let reading = 0;
    let peak = 0;
    // A few points each, on different days, so every file is its own run.
    const tinyRun = (day: number) => {
      const time = (s: number) => new Date(Date.UTC(2026, 0, day + 1, 8, 0, s)).toISOString();
      const pts = [0, 1, 2, 3].map((s) => `<trkpt lat="52.${s}" lon="4.9"><time>${time(s)}</time></trkpt>`).join('');
      return `<?xml version="1.0"?><gpx><trk><trkseg>${pts}</trkseg></trk></gpx>`;
    };
    const files = Array.from({ length: 30 }, (_, i) => {
      const f = new File([tinyRun(i)], `run-${i}.gpx`);
      const real = f.arrayBuffer.bind(f);
      vi.spyOn(f, 'arrayBuffer').mockImplementation(async () => {
        peak = Math.max(peak, ++reading);
        await new Promise((r) => setTimeout(r, 1));
        reading--;
        return real();
      });
      return f;
    });
    await importStore.importFiles(files);
    expect(importStore.state.files.every((f) => f.status === 'done')).toBe(true);
    expect(peak).toBeLessThanOrEqual(6);
  }, 60_000);
});
