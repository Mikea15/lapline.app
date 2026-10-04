// lib/sample-data.ts - "Try it with sample data": a handful of anonymised
// sessions bundled in public/demo/ (built by scripts/demo/make-demo-data.ts)
// that go through the normal importer, so they look and behave exactly like
// the user's own files. Their stored filenames carry SAMPLE_PREFIX, which is
// how the "Remove sample data" banner finds them again.
import { db } from './db';
import { shiftFitTimestamps, lastFitTimestamp, FIT_EPOCH_OFFSET } from './fit-rewrite';

export const SAMPLE_PREFIX = 'lapline-sample-';

export function isSampleFilename(name: string): boolean {
  return name.startsWith(SAMPLE_PREFIX);
}

/**
 * Downloads the bundled samples and returns them as Files ready for
 * importStore.importFiles, with every timestamp moved (by the same amount,
 * so their spacing is kept) so the newest session ended yesterday evening -
 * the Today, Calendar and 7-day views then have something in them.
 */
export async function fetchSampleFiles(now = new Date()): Promise<File[]> {
  const base = `${import.meta.env.BASE_URL}demo/`;
  const index = (await (await fetch(`${base}index.json`)).json()) as { files: string[] };
  const raw = await Promise.all(
    index.files.map(async (name) => {
      const res = await fetch(base + name);
      if (!res.ok) throw new Error(`Couldn't load sample ${name} (${res.status})`);
      return { name, bytes: new Uint8Array(await res.arrayBuffer()) };
    })
  );
  const newest = Math.max(...raw.map((r) => lastFitTimestamp(r.bytes) ?? 0));
  const yesterdayEvening = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 19, 0, 0);
  const delta = yesterdayEvening.getTime() / 1000 - FIT_EPOCH_OFFSET - newest;
  return raw.map((r) => new File([shiftFitTimestamps(r.bytes, delta)], SAMPLE_PREFIX + r.name.replace(/^sample-/, ''), { type: 'application/octet-stream' }));
}

/** How many stored activities came from sample files. */
export async function countSampleActivities(): Promise<number> {
  const ids = await sampleFileIds();
  if (ids.length === 0) return 0;
  return db.activities.where('sourceFileId').anyOf(ids).count();
}

async function sampleFileIds(): Promise<number[]> {
  return (await db.fitFiles.filter((f) => isSampleFilename(f.filename)).primaryKeys()) as number[];
}

/**
 * Deletes every activity imported from a sample file (with its records,
 * laps and lengths) and the stored sample files themselves. An activity
 * that a real import later matched and took over points at the real file
 * by then, so it's left alone.
 */
export async function removeSampleData(): Promise<number> {
  const fileIds = await sampleFileIds();
  if (fileIds.length === 0) return 0;
  return db.transaction('rw', [db.activities, db.activityRecords, db.activityLaps, db.activityLengths, db.activityEfforts, db.fitFiles, db.fitFileBlobs], async () => {
    const activityIds = (await db.activities.where('sourceFileId').anyOf(fileIds).primaryKeys()) as number[];
    await db.activityRecords.where('activityId').anyOf(activityIds).delete();
    await db.activityLaps.where('activityId').anyOf(activityIds).delete();
    await db.activityLengths.where('activityId').anyOf(activityIds).delete();
    await db.activityEfforts.bulkDelete(activityIds);
    await db.activities.bulkDelete(activityIds);
    await db.fitFileBlobs.bulkDelete(fileIds);
    await db.fitFiles.bulkDelete(fileIds);
    return activityIds.length;
  });
}
