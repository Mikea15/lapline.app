// lib/db.ts
// Dexie.js IndexedDB schema mirroring the SQLite tables.
// Uses compound indexes for unique constraints (date+sport for activities).

import Dexie from 'dexie';
import type { Entry, Activity, RecordPoint, Lap, SwimLength, Goal, Setting, StoredFitFile, FitFileBlob, DeviceSyncHandle } from './types';

export class HealthTrackerDB extends Dexie {
  entries!: Dexie.Table<Entry, number>;
  activities!: Dexie.Table<Activity, number>;
  activityRecords!: Dexie.Table<RecordPoint & { activityId: number }, number>;
  activityLaps!: Dexie.Table<Lap & { activityId: number }, number>;
  activityLengths!: Dexie.Table<SwimLength & { activityId: number }, number>;
  fitFiles!: Dexie.Table<StoredFitFile, number>;
  fitFileBlobs!: Dexie.Table<FitFileBlob, number>;
  goals!: Dexie.Table<Goal, string>;
  settings!: Dexie.Table<Setting, string>;
  deviceSync!: Dexie.Table<DeviceSyncHandle, string>;

  constructor() {
    super('HealthTracker');
    this.version(1).stores({
      entries: '++id, &date, weight, mood, steps, sleep, note, createdAt',
      activities: '++id, date, sport, [date+sport]',
      activityRecords: '++id, activityId, ts, hr, cadence, power, distance, temp',
      goals: '&key, target, updatedAt',
      settings: '&key, value'
    });

    // v2: added activityLaps (Garmin-style per-lap breakdown) alongside the
    // new speed/stride/zone fields on activities and altitude/speed/perf
    // fields on activityRecords - those are unindexed so they need no store
    // definition change, only the new table does.
    this.version(2).stores({
      entries: '++id, &date, weight, mood, steps, sleep, note, createdAt',
      activities: '++id, date, sport, [date+sport]',
      activityRecords: '++id, activityId, ts, hr, cadence, power, distance, temp',
      activityLaps: '++id, activityId',
      goals: '&key, target, updatedAt',
      settings: '&key, value'
    });

    // v3: added fitFiles, storing each imported .fit file's raw bytes so
    // activities can be re-parsed later (e.g. after a parser bugfix) without
    // re-uploading anything. activities gained sourceFileId, an unindexed-
    // until-now link back to the file it came from - added to the index list
    // here since Dexie needs the store definition to include every index a
    // query will use it for (reparse looks up activities by sourceFileId to
    // upsert in place rather than duplicate).
    this.version(3).stores({
      entries: '++id, &date, weight, mood, steps, sleep, note, createdAt',
      activities: '++id, date, sport, [date+sport], sourceFileId',
      activityRecords: '++id, activityId, ts, hr, cadence, power, distance, temp',
      activityLaps: '++id, activityId',
      fitFiles: '++id, filename, importedAt',
      goals: '&key, target, updatedAt',
      settings: '&key, value'
    });

    // v4: added deviceSync, a single-row table holding a remembered File
    // System Access directory handle (a connected watch/device folder) so
    // "Sync from device" (ImportPanel) can re-request permission on the same
    // folder across visits instead of asking the user to pick it every time.
    this.version(4).stores({
      entries: '++id, &date, weight, mood, steps, sleep, note, createdAt',
      activities: '++id, date, sport, [date+sport], sourceFileId',
      activityRecords: '++id, activityId, ts, hr, cadence, power, distance, temp',
      activityLaps: '++id, activityId',
      fitFiles: '++id, filename, importedAt',
      goals: '&key, target, updatedAt',
      settings: '&key, value',
      deviceSync: '&key'
    });

    // v5: split each stored .fit file's raw bytes out of `fitFiles` into a
    // new `fitFileBlobs` table (same id). `fitFilesStore.load()` lists every
    // row of `fitFiles` on every app boot just to show a count/total size -
    // with the bytes living in the same row, that meant deserializing every
    // imported file's full binary payload out of IndexedDB before the app
    // could even mount, which is what made cold boot scale (badly) with
    // import history. The bytes are still kept, just no longer in the way of
    // that listing - only re-parsing and fresh imports need them now.
    this.version(5)
      .stores({
        entries: '++id, &date, weight, mood, steps, sleep, note, createdAt',
        activities: '++id, date, sport, [date+sport], sourceFileId',
        activityRecords: '++id, activityId, ts, hr, cadence, power, distance, temp',
        activityLaps: '++id, activityId',
        fitFiles: '++id, filename, importedAt',
        fitFileBlobs: 'id',
        goals: '&key, target, updatedAt',
        settings: '&key, value',
        deviceSync: '&key'
      })
      .upgrade(async (tx) => {
        const files = await tx.table('fitFiles').toArray();
        for (const f of files) {
          const { data, ...meta } = f;
          await tx.table('fitFileBlobs').put({ id: f.id, data });
          await tx.table('fitFiles').put(meta);
        }
      });

    // v6: added activityLengths - the FIT `length` message (one row per
    // pool length, active swim or resting pause), separate from
    // activityLaps because a pool-swim "lap" usually groups several
    // lengths plus rest rather than mapping 1:1 to one length. Backs the
    // sport-specific swim splits display instead of forcing swim data
    // through the running-shaped Lap table. activities also gained
    // poolLengthM, unindexed so it needs no store-string change.
    this.version(6).stores({
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
    });

    // Ensure date+sport uniqueness for activities (Dexie handles via compound index)
    // Note: Dexie's [date+sport] creates a compound index but not a unique constraint.
    // We'll enforce uniqueness at the application level in saveActivities().
  }
}

export const db = new HealthTrackerDB();

// Helper: check if database is empty (first run)
export async function isFirstRun(): Promise<boolean> {
  const count = await db.entries.count();
  return count === 0;
}

// Helper: wipe every table (used by Settings > "Reset all data"). Empties
// the object stores rather than deleting the database itself, so the app
// keeps working immediately without a reload.
export async function resetAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.entries, db.activities, db.activityRecords, db.activityLaps, db.activityLengths, db.fitFiles, db.fitFileBlobs, db.goals, db.settings],
    async () => {
      await Promise.all([
        db.entries.clear(),
        db.activities.clear(),
        db.activityRecords.clear(),
        db.activityLaps.clear(),
        db.activityLengths.clear(),
        db.fitFiles.clear(),
        db.fitFileBlobs.clear(),
        db.goals.clear(),
        db.settings.clear()
      ]);
    }
  );
}
