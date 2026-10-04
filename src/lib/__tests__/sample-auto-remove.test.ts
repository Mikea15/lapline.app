import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { db } from '../db';
import { backupStore, importStore } from '../stores.svelte';
import { SAMPLE_PREFIX, countSampleActivities } from '../sample-data';
import { MANIFEST_PATH, buildManifest } from '../backup';

// The real import path, with the parse workers running in-process.
vi.mock('../fit-parse-pool', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../fit-parse-pool')>();
  const { createInProcessWorker } = await import('./in-process-worker');
  return { ...actual, createFitParsePool: (n: number) => actual.createFitParsePool(n, { createWorker: createInProcessWorker }) };
});

// A short run per file, on different days, so the real one never takes
// over the sample's activity by date and sport.
function gpxRun(day: string): Uint8Array {
  const points = Array.from({ length: 120 }, (_, i) => {
    const time = new Date(Date.parse(`${day}T08:00:00Z`) + i * 1000).toISOString();
    return `<trkpt lat="${(52.3 + i * 0.00003).toFixed(6)}" lon="4.9"><ele>10</ele><time>${time}</time></trkpt>`;
  });
  return strToU8(`<?xml version="1.0"?><gpx><trk><type>running</type><trkseg>${points.join('')}</trkseg></trk></gpx>`);
}
const sampleFile = () => new File([gpxRun('2026-09-01') as BlobPart], `${SAMPLE_PREFIX}run.gpx`);
const ownFile = () => new File([gpxRun('2026-09-02') as BlobPart], 'own-run.gpx');

beforeEach(async () => {
  await db.delete({ disableAutoOpen: false });
  importStore.reset();
});

async function loadSamples() {
  await importStore.importFiles([sampleFile()]);
  expect(await countSampleActivities()).toBeGreaterThan(0);
}

describe('sample data on the first real import', () => {
  it('is kept when only sample files are imported', async () => {
    await loadSamples();
    expect(importStore.state.result?.sampleRemoved).toBe(0);
  });

  it('is removed once one of the user’s own files is saved', async () => {
    await loadSamples();

    await importStore.importFiles([ownFile()]);

    expect(importStore.state.result?.errors).toEqual([]);
    expect(importStore.state.result?.sampleRemoved).toBe(1);
    expect(await countSampleActivities()).toBe(0);
    const files = await db.fitFiles.toArray();
    expect(files.map((f) => f.filename)).toEqual(['own-run.gpx']);
    expect(await db.fitFileBlobs.count()).toBe(1);
    // Only the real run's activity and its records are left.
    const activities = await db.activities.toArray();
    expect(activities).toHaveLength(1);
    expect(activities[0]!.sourceFileId).toBe(files[0]!.id);
    const recordOwners = new Set((await db.activityRecords.toArray()).map((r) => r.activityId));
    expect([...recordOwners]).toEqual([activities[0]!.id]);
  });

  it('is kept when every real file fails', async () => {
    await loadSamples();

    await importStore.importFiles([new File([], 'empty.gpx')]);

    expect(importStore.state.result?.errors).toHaveLength(1);
    expect(importStore.state.result?.sampleRemoved).toBe(0);
    expect(await countSampleActivities()).toBeGreaterThan(0);
  });

  it('is removed by a backup restore with the user’s files', async () => {
    await loadSamples();
    const data = gpxRun('2026-09-02');
    const manifest = buildManifest([{ filename: 'own-run.gpx', importedAt: '2026-09-01T10:00:00Z' }], {}, 'test', '2026-09-02T10:00:00Z');
    const zip = zipSync({ [MANIFEST_PATH]: strToU8(JSON.stringify(manifest)), [manifest.files[0]!.path]: data });

    const result = await backupStore.restore(new File([zip], 'backup.zip'));

    expect(result.sampleRemoved).toBe(1);
    expect(await countSampleActivities()).toBe(0);
    expect(await db.activities.count()).toBe(1);
  });
});
