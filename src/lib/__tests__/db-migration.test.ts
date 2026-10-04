import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { HealthTrackerDB } from '../db';

// The v6 schema exactly as shipped, to build a database an existing user
// would have before upgrading.
const V6_STORES = {
  entries: '++id, &date, weight, mood, steps, sleep, note, createdAt',
  activities: '++id, date, sport, [date+sport], sourceFileId',
  activityRecords: '++id, activityId, ts, hr, cadence, power, distance, temp',
  activityLaps: '++id, activityId',
  activityLengths: '++id, activityId',
  fitFiles: '++id, filename, importedAt',
  fitFileBlobs: 'id',
  goals: '&key, target, updatedAt',
  settings: '&key, value',
  deviceSync: '&key'
};

function record(activityId: number, t: number) {
  return { activityId, t, hr: 120 + t, cadence: 80, power: 0, distance: t * 3, temp: 20, altitude: 10, speed: 10, perfCondition: null, lat: null, lon: null };
}

afterEach(async () => {
  await Dexie.delete('HealthTracker');
});

describe('db v7 migration', () => {
  it('keeps every record and leaves activityRecords indexed by activityId only', async () => {
    const old = new Dexie('HealthTracker');
    old.version(6).stores(V6_STORES);
    await old.table('activities').bulkAdd([{ date: '2026-09-01', sport: 'running' }, { date: '2026-09-02', sport: 'cycling' }]);
    // Interleaved across activities, as two imports would leave them.
    await old.table('activityRecords').bulkAdd([record(1, 0), record(1, 1), record(2, 0), record(1, 2), record(2, 1)]);
    await old.table('settings').put({ key: 'unit_system', value: 'imperial' });
    old.close();

    const db = new HealthTrackerDB();
    await db.open();
    expect(db.verno).toBe(8);
    expect(db.activityRecords.schema.indexes.map((i) => i.name)).toEqual(['activityId']);
    expect(await db.activityRecords.count()).toBe(5);
    expect((await db.activityRecords.where('activityId').equals(1).toArray()).map((r) => r.t)).toEqual([0, 1, 2]);
    expect((await db.activityRecords.where('activityId').equals(2).toArray()).map((r) => r.hr)).toEqual([120, 121]);
    expect(await db.settings.get('unit_system')).toEqual({ key: 'unit_system', value: 'imperial' });
    expect(await db.activities.where('[date+sport]').equals(['2026-09-02', 'cycling']).count()).toBe(1);
    db.close();

    // What the browser actually holds, not just Dexie's view of it.
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('HealthTracker');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const names = Array.from(raw.transaction('activityRecords').objectStore('activityRecords').indexNames);
    raw.close();
    expect(names).toEqual(['activityId']);
  });

  it('creates a fresh database at v8', async () => {
    const db = new HealthTrackerDB();
    await db.open();
    expect(db.verno).toBe(8);
    expect(db.tables.map((t) => t.name).sort()).toEqual([...Object.keys(V6_STORES), 'activityEfforts'].sort());
    db.close();
  });
});
