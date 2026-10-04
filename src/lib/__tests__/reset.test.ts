import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { deviceSyncStore, initStores, resetAllStores } from '../stores.svelte';
import type { Activity, DeviceSyncHandle } from '../types';

beforeEach(async () => {
  await db.delete({ disableAutoOpen: false });
});

async function fillEveryTable() {
  const activityId = await db.activities.add({ date: '2026-09-01', sport: 'running' } as Activity);
  await db.entries.add({ date: '2026-09-01', createdAt: '' } as never);
  await db.activityRecords.add({ activityId, t: 0, hr: 120, cadence: 0, power: 0, distance: 0, temp: 0, altitude: 0, speed: 0, perfCondition: null, lat: null, lon: null });
  await db.activityLaps.add({ activityId, index: 0, startOffsetSec: 0, elapsedSec: 60, distanceM: 200, avgPaceMinPerKm: 5, avgHR: 120, maxHR: 130, avgCadence: 80 });
  await db.activityLengths.add({ activityId } as never);
  await db.activityEfforts.put({ activityId, version: 1, maxSpeedMps: 12, bestTimeSec: [], bestDistanceM: [], kmSplitPaces: [] });
  const fileId = await db.fitFiles.add({ filename: 'run.fit', size: 3, importedAt: '' } as never);
  await db.fitFileBlobs.put({ id: fileId, data: new Uint8Array([1, 2, 3]) });
  await db.goals.put({ key: 'weekly_km', target: 30, updatedAt: '' });
  await db.settings.put({ key: 'analytics_enabled', value: 'true' });
  // A stand-in for the folder handle: structured-cloneable, which is all IndexedDB needs.
  await db.deviceSync.put({ key: 'default', name: 'GARMIN', handle: { name: 'GARMIN' } as unknown as FileSystemDirectoryHandle, lastSyncedAt: '2026-09-01T10:00:00Z' } satisfies DeviceSyncHandle);
}

describe('resetAllStores', () => {
  it('empties every table, the remembered device folder included', async () => {
    await fillEveryTable();
    for (const t of db.tables) expect(await t.count(), t.name).toBeGreaterThan(0);

    await resetAllStores();

    for (const t of db.tables) expect(await t.count(), t.name).toBe(0);
  });

  it('forgets the device folder in memory too', async () => {
    await fillEveryTable();
    await initStores();
    expect(deviceSyncStore.connected).toBe(true);
    expect(deviceSyncStore.name).toBe('GARMIN');

    await resetAllStores();

    expect(deviceSyncStore.connected).toBe(false);
    expect(deviceSyncStore.name).toBeNull();
    expect(deviceSyncStore.lastSyncedAt).toBeNull();
  });
});
