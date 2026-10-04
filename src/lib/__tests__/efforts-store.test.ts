import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { db } from '../db';
import { parseFIT } from '../fit-parser';
import { activitiesStore, importStore } from '../stores.svelte';
import { backfillEfforts, getEfforts, getEffortsForView, invalidateEfforts, startEffortsBackfill, trackedEffortsForView } from '../efforts-store';
import { effortsFill } from '../efforts-progress.svelte';
import { computeActivityEfforts, EFFORTS_VERSION, type ActivityEfforts } from '../activity-efforts';
import { removeSampleData, SAMPLE_PREFIX } from '../sample-data';
import type { Activity } from '../types';

// The real import path, with the parse workers running in-process.
vi.mock('../fit-parse-pool', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../fit-parse-pool')>();
  const { createInProcessWorker } = await import('./in-process-worker');
  return { ...actual, createFitParsePool: (n: number) => actual.createFitParsePool(n, { createWorker: createInProcessWorker }) };
});

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../../../test-fixtures/${name}`, import.meta.url)));
// A run whose watch logged distance spikes, a pool swim and a ride.
const FIXTURES = ['run-steady.fit', 'pool-swim-1.fit', 'ride-morning.fit'];

// The v7 schema exactly as shipped, to build a database an existing user
// would have before upgrading.
const V7_STORES = {
  entries: '++id, &date, weight, mood, steps, sleep, note, createdAt',
  activities: '++id, date, sport, [date+sport], sourceFileId',
  activityRecords: '++id, activityId',
  activityLaps: '++id, activityId',
  activityLengths: '++id, activityId',
  fitFiles: '++id, filename, importedAt',
  fitFileBlobs: 'id',
  goals: '&key, target, updatedAt',
  settings: '&key, value',
  deviceSync: '&key'
};

// What the row should hold: computed from the stored records, as the
// screens read them before v8.
async function expectedEfforts(a: Activity): Promise<ActivityEfforts> {
  const records = await db.activityRecords.where('activityId').equals(a.id).toArray();
  return computeActivityEfforts(
    a.id,
    a.sport,
    records.map((r) => r.distance),
    records.map((r) => r.t)
  );
}

beforeEach(async () => {
  db.close({ disableAutoOpen: false });
  await Dexie.delete('HealthTracker');
  invalidateEfforts();
  importStore.reset();
});

describe('db v8: activityEfforts', () => {
  it('upgrades a v7 database, then backfills a row per activity from its records', async () => {
    const old = new Dexie('HealthTracker');
    old.version(7).stores(V7_STORES);
    for (const name of FIXTURES) {
      for (const pa of await parseFIT(new Uint8Array(fixture(name)))) {
        const { id: _placeholder, ...activity } = pa.activity;
        const activityId = (await old.table('activities').add(activity)) as number;
        await old.table('activityRecords').bulkAdd(pa.records.map((r) => ({ ...r, activityId })));
      }
    }
    const recordCount = await old.table('activityRecords').count();
    old.close();

    await db.open();
    expect(db.verno).toBe(8);
    expect(await db.activityRecords.count()).toBe(recordCount);
    expect(await db.activityEfforts.count()).toBe(0);

    const acts = await db.activities.orderBy('date').toArray();
    expect(acts).toHaveLength(FIXTURES.length);
    expect(await backfillEfforts(acts)).toBe(acts.length);
    for (const a of acts) {
      const want = await expectedEfforts(a);
      expect(await db.activityEfforts.get(a.id)).toEqual(want);
      expect(await getEfforts(a)).toEqual(want);
    }
    // Everything is there now: a second pass computes nothing.
    expect(await backfillEfforts(acts)).toBe(0);
  });

  it('recomputes a row from an older EFFORTS_VERSION', async () => {
    await importStore.importFiles([new File([fixture('run-steady.fit')], 'run-steady.fit')]);
    const [a] = await db.activities.toArray();
    const want = await expectedEfforts(a!);
    await db.activityEfforts.put({ ...want, version: EFFORTS_VERSION - 1, bestTimeSec: [1, 1, 1, 1] });
    invalidateEfforts();

    expect(await getEfforts(a!)).toEqual(want);
    expect(await db.activityEfforts.get(a!.id)).toEqual(want);
  });

  it('is written with every imported activity, so nothing needs backfilling', async () => {
    await importStore.importFiles(FIXTURES.map((n) => new File([fixture(n)], n)));
    expect(importStore.state.result?.errors).toEqual([]);
    const acts = await db.activities.orderBy('date').toArray();
    expect(await db.activityEfforts.count()).toBe(acts.length);
    for (const a of acts) expect(await db.activityEfforts.get(a.id)).toEqual(await expectedEfforts(a));
    expect(await backfillEfforts(acts)).toBe(0);
    // The store serves the same rows.
    expect(await activitiesStore.getEfforts(acts[0]!)).toEqual(await expectedEfforts(acts[0]!));
  });

  it('reports the fill as reactive state, newest first, leaving unreached rows to the fill', async () => {
    await importStore.importFiles(FIXTURES.map((n) => new File([fixture(n)], n)));
    const acts = await db.activities.orderBy('date').toArray();
    await db.activityEfforts.clear();
    invalidateEfforts();
    const newest = acts[acts.length - 1]!;
    const oldest = acts[0]!;

    const tick0 = effortsFill.tick;
    const run = await startEffortsBackfill(acts);
    // Planned, not started: the app can show now.
    expect(effortsFill).toMatchObject({ running: true, done: 0, total: acts.length });
    expect(await getEffortsForView(newest)).toBeNull();
    const tracked = trackedEffortsForView();
    expect(await tracked.get(oldest)).toBeNull();
    expect(tracked.missing()).toBe(1);
    expect(await db.activityEfforts.count()).toBe(0);

    // Newest first: after one step only the newest has a row.
    const done = run();
    while (effortsFill.done < 1) await new Promise((r) => setTimeout(r, 0));
    expect(await db.activityEfforts.get(newest.id)).toBeDefined();
    if (effortsFill.done === 1) expect(await db.activityEfforts.get(oldest.id)).toBeUndefined();

    expect(await done).toBe(acts.length);
    expect(effortsFill).toMatchObject({ running: false, done: acts.length, total: acts.length });
    expect(effortsFill.tick).toBeGreaterThan(tick0);
    // Done: served from the rows, or computed on demand, never null.
    expect(await getEffortsForView(oldest)).toEqual(await expectedEfforts(oldest));
  });

  it('has nothing to report when every row is there', async () => {
    await importStore.importFiles(FIXTURES.map((n) => new File([fixture(n)], n)));
    const acts = await db.activities.orderBy('date').toArray();
    const run = await startEffortsBackfill(acts);
    expect(effortsFill.running).toBe(false);
    expect(await run()).toBe(0);
  });

  it('goes with the activity when the sample data is removed', async () => {
    await importStore.importFiles([new File([fixture('run-steady.fit')], `${SAMPLE_PREFIX}run.fit`)]);
    expect(await db.activityEfforts.count()).toBe(1);
    await removeSampleData();
    expect(await db.activities.count()).toBe(0);
    expect(await db.activityEfforts.count()).toBe(0);
  });
});
