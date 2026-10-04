// lib/stores.ts
// Svelte 5 runes-based stores for reactive UI state.
// All data flows through these stores; components subscribe via $derived/$effect.

import { db, resetAllData } from './db';
import { findExistingActivity } from './activity-match';
import { computeAllRecords, type RecordResult } from './records';
import { effortsForParsed, getEfforts, getEffortsForView, invalidateEfforts, startEffortsBackfill, trackedEffortsForView } from './efforts-store';
import { effortsFill } from './efforts-progress.svelte';
import type { ActivityEfforts } from './activity-efforts';
import { createBackupZip, readBackupZip, backupFilename, ZIP_TOO_LARGE_MESSAGE } from './backup';
import { CURRENT_VERSION } from './release-notes';
import { createFitParsePool, workoutFormat, type FitParsePool } from './fit-parse-pool';
import { trackEvent } from './analytics';
import { isSampleFilename, removeSampleData } from './sample-data';
import {
  fitManufacturer,
  fitFailureReason,
  gpxFailureReason,
  failureMessage,
  GENERIC_IMPORT_ERROR,
  MAX_IMPORT_FILE_BYTES,
  MAX_ZIP_BYTES,
  type ImportFailureReason
} from './import-failure';
import type { Entry, Activity, RecordPoint, Goal, Setting, ParsedActivity, ActivityDetail, StoredFitFile } from './types';
import type { UnitSystem } from './units';
import { isRangePreset, type RangePreset } from './range-preset';
import type { Sex } from './today-kpis';

// ===== Entries Store =====
let _entries: Entry[] = $state<Entry[]>([]);
let _entriesLoaded = $state(false);

export const entriesStore = {
  get all() { return _entries; },
  get loaded() { return _entriesLoaded; },

  async load() {
    _entries = await db.entries.orderBy('date').toArray();
    _entriesLoaded = true;
  },

  async upsert(entry: Omit<Entry, 'id' | 'createdAt'>) {
    const now = new Date().toISOString();
    const existing = await db.entries.where('date').equals(entry.date).first();
    if (existing) {
      await db.entries.update(existing.id!, { ...entry, createdAt: existing.createdAt });
    } else {
      const id = await db.entries.add({ ...entry, createdAt: now } as Entry);
      // Entry returned from add doesn't include id in some Dexie versions
    }
    await this.load();
  },

  async delete(id: number) {
    await db.entries.delete(id);
    await this.load();
  },

  async exportData(): Promise<Entry[]> {
    return db.entries.orderBy('date').toArray();
  }
};

// ===== Activities Store =====
let _activities: Activity[] = $state<Activity[]>([]);
let _activitiesLoaded = $state(false);
// allRecords() memo: computed once per loaded activity list (load() swaps
// in a new array), not once per screen.
let _recordsCache: { source: Activity[]; tick: number; promise: Promise<RecordResult[]> } | null = null;

export const activitiesStore = {
  get all() { return _activities; },
  get loaded() { return _activitiesLoaded; },

  async load() {
    // Whatever just changed the activities (an import, a re-parse, removing
    // the samples, a reset) may have rewritten their efforts rows too.
    invalidateEfforts();
    _activities = await db.activities.orderBy('date').toArray();
    _activitiesLoaded = true;
  },

  // One activity's best efforts and km splits (lib/activity-efforts.ts):
  // what Records, Trends and Today's VO2max read instead of its full detail.
  getEfforts(activity: Activity): Promise<ActivityEfforts> {
    return getEfforts(activity);
  },

  // The same, for the screens that read many activities' efforts: null for
  // a row the background fill (below) hasn't reached yet, instead of
  // computing it on demand. effortsFill (lib/efforts-progress.svelte.ts)
  // says whether that can happen and how far along the fill is.
  getEffortsForView(activity: Activity): Promise<ActivityEfforts | null> {
    return getEffortsForView(activity);
  },

  // getEffortsForView plus a count of the rows it left out.
  trackedEffortsForView() {
    return trackedEffortsForView();
  },

  // Plans the efforts rows activities don't have yet (everything, the first
  // boot after the v8 upgrade) and starts computing them in the
  // background, newest first. Called once after the first load(); resolves
  // as soon as the plan is made, with a function that resolves when the
  // fill is done (the number of rows it computed).
  startEffortsBackfill(): Promise<() => Promise<number>> {
    return startEffortsBackfill(_activities);
  },

  // Every record over the whole history, shared by the sidebar's Records
  // badge and the PR flags on Today's and the Activities screen's ledgers.
  // (The Records screen streams its own rows via computeRecordsStreaming.)
  // Reading `all` here also makes a $derived caller recompute after load().
  allRecords(): Promise<RecordResult[]> {
    const source = this.all;
    // While the efforts fill runs, what it has reached so far is used, and
    // the memo is redone as the fill ticks (also making $derived callers
    // recompute).
    const tick = effortsFill.tick;
    if (_recordsCache?.source !== source || _recordsCache.tick !== tick) {
      _recordsCache = { source, tick, promise: computeAllRecords(source, getEffortsForView) };
    }
    return _recordsCache.promise;
  },

  // Persists a reverse-geocoded place name (lib/geocode.ts) so it's a
  // one-time lookup per activity rather than repeating it on every visit.
  // Updates the in-memory list too, so any other view of this activity
  // (e.g. the ledger) picks it up without a reload.
  async setLocationLabel(id: number, locationLabel: string) {
    await db.activities.update(id, { locationLabel });
    const a = _activities.find((x) => x.id === id);
    if (a) a.locationLabel = locationLabel;
  },

  // Same one-time-lookup persistence as setLocationLabel above, for the
  // weather condition word (lib/weather.ts).
  async setWeatherCondition(id: number, weatherCondition: string) {
    await db.activities.update(id, { weatherCondition });
    const a = _activities.find((x) => x.id === id);
    if (a) a.weatherCondition = weatherCondition;
  },

  async getDetail(id: number): Promise<ActivityDetail | null> {
    const activity = await db.activities.get(id);
    if (!activity) return null;

    // Already in time order (insertion order within the activityId index -
    // see db.ts v7), so no sort.
    const records = await db.activityRecords.where('activityId').equals(id).toArray();

    const laps = await db.activityLaps
      .where('activityId')
      .equals(id)
      .sortBy('index');

    const lengths = await db.activityLengths
      .where('activityId')
      .equals(id)
      .sortBy('index');

    return {
      ...activity,
      t: records.map(r => r.t),
      hr: records.map(r => r.hr),
      cadence: records.map(r => r.cadence),
      power: records.map(r => r.power),
      distance: records.map(r => r.distance),
      temperature: records.map(r => r.temp),
      altitude: records.map(r => r.altitude),
      speed: records.map(r => r.speed),
      perfCondition: records.map(r => r.perfCondition),
      lat: records.map(r => r.lat),
      lon: records.map(r => r.lon),
      laps,
      lengths
    };
  }
};

// ===== Goals Store =====
let _goals: Record<string, number> = $state({});

export const goalsStore = {
  get all() { return _goals; },

  async load() {
    const goals = await db.goals.toArray();
    _goals = Object.fromEntries(goals.map(g => [g.key, g.target]));
  },

  async save(goals: Record<string, number>) {
    const now = new Date().toISOString();
    await db.transaction('rw', db.goals, async () => {
      for (const [key, target] of Object.entries(goals)) {
        if (target < 0) continue;
        await db.goals.put({ key, target, updatedAt: now });
      }
    });
    await this.load();
  }
};

// ===== Settings Store =====
export type TextSize = 'small' | 'default' | 'large' | 'xlarge';
export const TEXT_SIZE_SCALE: Record<TextSize, number> = { small: 0.95, default: 1, large: 1.12, xlarge: 1.25 };
export const TEXT_SIZE_OPTIONS: [TextSize, string][] = [['small', 'S'], ['default', 'M'], ['large', 'L'], ['xlarge', 'XL']];

let _settings: Record<string, string> = $state({});

export const settingsStore = {
  get all() { return _settings; },

  async load() {
    const settings = await db.settings.toArray();
    _settings = Object.fromEntries(settings.map(s => [s.key, s.value]));
  },

  async save(settings: Record<string, string>) {
    await db.transaction('rw', db.settings, async () => {
      for (const [key, value] of Object.entries(settings)) {
        if (value === '') {
          await db.settings.delete(key);
        } else {
          await db.settings.put({ key, value });
        }
      }
    });
    await this.load();
  },

  // Settings > Training > Birth year and Sex: only used to pick the age/sex
  // row of Today's VO2max rating bands (lib/today-kpis.ts). null until set.
  getBirthYear(): number | null {
    const v = parseInt(_settings.birth_year || '', 10);
    return !isNaN(v) && v > 1900 ? v : null;
  },
  getAge(): number | null {
    const y = this.getBirthYear();
    return y === null ? null : new Date().getFullYear() - y;
  },
  getSex(): Sex | null {
    const v = _settings.sex;
    return v === 'female' || v === 'male' ? v : null;
  },

  getUnitSystem(): UnitSystem {
    return _settings.unit_system === 'imperial' ? 'imperial' : 'metric';
  },

  // What the header's global range filter opens to on a fresh load - '1y'
  // when the user hasn't chosen one, rather than the much narrower rolling
  // window a first-time preset default would otherwise land on.
  getDefaultRangePreset(): RangePreset {
    const v = _settings.default_range_preset;
    return v && isRangePreset(v) ? v : '1y';
  },

  // Whether the first-time-user Welcome modal has already been shown and
  // dismissed. A full "Reset all data" wipes this along with everything
  // else, so a genuinely fresh browser sees the welcome flow again.
  // Settings > Display > Text size: the multiplier App.svelte applies as
  // --text-scale, which every --fs-* token in styles/tokens.css is built on.
  getTextSize(): TextSize {
    const v = _settings.text_size;
    return v && v in TEXT_SIZE_SCALE ? (v as TextSize) : 'default';
  },
  getTextScale(): number {
    return TEXT_SIZE_SCALE[this.getTextSize()];
  },

  // The Safari "install to keep your data" notice (App.svelte), once closed.
  getInstallHintDismissed(): boolean {
    return _settings.install_hint_dismissed === 'true';
  },

  getHasSeenWelcome(): boolean {
    return _settings.has_seen_welcome === 'true';
  },

  // Opt-in: off unless the user has explicitly turned it on in Settings, so
  // an unset key (a fresh browser, or one from before this became opt-in)
  // means off. Someone who explicitly chose On keeps it.
  getAnalyticsEnabled(): boolean {
    return _settings.analytics_enabled === 'true';
  },

  // Opt-in (the reverse default of analytics above): off unless the user has
  // explicitly turned it on, since this sends an activity's real GPS
  // coordinate to a third party (lib/geocode.ts) rather than an anonymous
  // usage count.
  getLocationLookupEnabled(): boolean {
    return _settings.location_lookup_enabled === 'true';
  },

  // Same opt-in contract: map tiles under the Plan route (lib/map-tiles.ts)
  // tell the tile host which area an activity was in.
  getMapTilesEnabled(): boolean {
    return _settings.map_tiles_enabled === 'true';
  },

  // Same opt-in contract as location lookup above, for its own toggle -
  // sending an activity's date/time/coordinate to a weather provider is
  // separate consent from sending it to a geocoder, even though both are
  // "real location data" in the same way.
  getWeatherLookupEnabled(): boolean {
    return _settings.weather_lookup_enabled === 'true';
  }
};

// Runs at most `max` tasks at once; the rest wait their turn in order.
function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (task) => {
    if (active < max) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      // Hand the slot straight to the next task, or give it back.
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

// Runs the tasks one at a time, in the order they're queued. One task's
// failure goes to its own caller and doesn't block the tasks after it.
function createWriteQueue(): (task: () => Promise<void>) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return (task) => {
    const run = tail.then(task, task);
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function findIdenticalStoredFile(filename: string, bytes: Uint8Array): Promise<number | undefined> {
  const sameName = await db.fitFiles.where('filename').equals(filename).filter((f) => f.size === bytes.byteLength).toArray();
  for (const f of sameName) {
    const blob = await db.fitFileBlobs.get(f.id);
    if (blob && sameBytes(blob.data, bytes)) return f.id;
  }
  return undefined;
}

// ===== Import Status Store =====
export interface ImportFileStatus {
  name: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  message?: string;
}

interface ImportState {
  status: 'idle' | 'processing' | 'done' | 'error';
  files: ImportFileStatus[];
  result?: {
    files: number;
    imported: number;
    errors: string[];
    /** Sample activities removed because the user's own files came in. */
    sampleRemoved: number;
  };
  error?: string;
}

let _importState = $state<ImportState>({ status: 'idle', files: [] });

export const importStore = {
  get state() { return _importState; },

  // `rejected` are files turned away before import could read them (too
  // large, from a .zip); they're listed with the rest, already failed.
  async importFiles(files: File[], rejected: { name: string; reason: ImportFailureReason }[] = []): Promise<void> {
    _importState = {
      status: 'processing',
      files: [
        ...files.map((f): ImportFileStatus => ({ name: f.name, status: 'pending' })),
        ...rejected.map((r): ImportFileStatus => ({ name: r.name, status: 'error', message: failureMessage(r.reason) }))
      ]
    };
    try {
      let totalImported = 0;
      let processedFiles = 0;
      let ownFilesSaved = 0;
      const errors: string[] = rejected.map((r) => `${r.name}: ${failureMessage(r.reason)}`);
      for (const r of rejected) {
        trackEvent('import_file_failed', { format: workoutFormat(r.name), manufacturer: 'unknown', reason: r.reason });
      }
      // Every file is read and parsed in the worker pool, each read only
      // once a worker is free for it.
      const pool = files.length > 0 ? createFitParsePool(files.length) : null;
      // At most this many files are in flight at once (read, parsed or
      // waiting to be saved), so a big import holds a few files' bytes and
      // parsed records in memory rather than all of them. Twice the pool,
      // so workers keep parsing while earlier files are being saved.
      const inFlight = createLimiter((pool?.size ?? 1) * 2);

      // Parsing (CPU-bound) runs concurrently across the worker pool, but
      // the DB write for each parsed file - an upsert keyed on
      // [date+sport] that reads-then-writes - is not safe to run
      // concurrently with itself, so writes are chained through this queue
      // to execute one at a time regardless of which file finishes parsing
      // first.
      const enqueueWrite = createWriteQueue();

      await Promise.all(
        files.map((file, i) =>
          inFlight(async () => {
            const entry = _importState.files[i]!;
            const format = workoutFormat(file.name);
            let bytes = new Uint8Array(0);
            let saving = false;
            let tooLarge = false;
            try {
              if (file.size === 0) {
                throw new Error('file is empty');
              }
              if (file.size > MAX_IMPORT_FILE_BYTES) {
                tooLarge = true;
                throw new Error('file is too large');
              }
              const activities = await pool!.parse(
                { format, read: async () => (bytes = new Uint8Array(await file.arrayBuffer())) },
                () => (entry.status = 'processing')
              );
              if (activities.length === 0) {
                // The decoder can succeed (return no error) on a file that is
                // structurally valid but corrupted, empty of track/session data,
                // or not a workout file at all (e.g. a FIT monitoring/settings
                // export, or a GPX with no timestamped track points). Without
                // this check that case reports as a silent success with nothing
                // actually imported.
                throw new Error(
                  format === 'gpx'
                    ? 'no track points found (file may be corrupted or not a GPX track with timestamps)'
                    : 'no workout data found (file may be corrupted or not a workout FIT file)'
                );
              }
              saving = true;
              await enqueueWrite(async () => {
                // Keep the raw bytes (in fitFileBlobs, separate from the
                // fitFiles metadata row - see db.ts's v5 migration) so a future
                // parser fix can be re-applied via "Re-parse stored files"
                // (Settings) without re-uploading anything. Stored only once
                // the file is confirmed to hold real workout data, so a
                // rejected/corrupt upload never leaves an orphaned row behind.
                // File and activities go in one transaction (saveActivities'
                // own joins it), so a failed save rolls the file back too.
                await db.transaction('rw', IMPORT_TABLES, async () => {
                  // Re-importing a byte-identical file (a second drop of the same
                  // file, or restoring a backup into a browser that already has
                  // it) reuses its stored copy instead of keeping a duplicate.
                  // saveActivities then matches its activities by position under
                  // that id, so they're updated in place, not added again.
                  let sourceFileId = await findIdenticalStoredFile(file.name, bytes);
                  if (sourceFileId === undefined) {
                    sourceFileId = await db.fitFiles.add({
                      filename: file.name,
                      size: bytes.byteLength,
                      importedAt: new Date().toISOString()
                    } as StoredFitFile);
                    await db.fitFileBlobs.put({ id: sourceFileId, data: bytes });
                  }
                  await saveActivities(activities, sourceFileId);
                });
                totalImported += activities.length;
                processedFiles++;
                if (!isSampleFilename(file.name)) ownFilesSaved++;
                entry.status = 'done';
                entry.message = `${activities.length} ${activities.length === 1 ? 'activity' : 'activities'}`;
              });
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              const reason: ImportFailureReason = tooLarge
                ? 'too_large'
                : saving
                  ? 'save_error'
                  : format === 'gpx'
                    ? gpxFailureReason(bytes, message)
                    : fitFailureReason(bytes, message);
              errors.push(`${file.name}: ${failureMessage(reason)}`);
              entry.status = 'error';
              entry.message = failureMessage(reason);
              // Maker and error type only - never the file's name or contents.
              trackEvent('import_file_failed', { format, manufacturer: format === 'gpx' ? 'gpx' : fitManufacturer(bytes), reason });
            }
          })
        )
      );
      pool?.terminate();

      // The user's own workouts have arrived (from files, a device folder
      // or a backup), so the demo runs go: left in, they'd mix into every
      // total, trend and record. Only after at least one real file saved, so
      // an import that failed outright still leaves something to look at.
      // A sample activity a real file matched and took over points at the
      // real file by now, so removeSampleData leaves it alone.
      let sampleRemoved = 0;
      if (ownFilesSaved > 0) {
        try {
          sampleRemoved = await removeSampleData();
          if (sampleRemoved > 0) trackEvent('sample_data_removed', { automatic: true });
        } catch (e) {
          // Not fatal: the banner still offers "Remove sample data".
          console.error(e);
        }
      }

      // Reload the stores first, so the result (and the sample banner going
      // away) shows up together with the new activity list.
      await Promise.all([
        entriesStore.load(),
        activitiesStore.load(),
        fitFilesStore.load()
      ]);

      _importState = {
        ..._importState,
        status: 'done',
        result: { files: processedFiles, imported: totalImported, errors, sampleRemoved }
      };
      // Counts only - never a filename or anything derived from activity
      // content.
      trackEvent('import_completed', { files: processedFiles, imported: totalImported, errors: errors.length });
    } catch (e) {
      console.error(e);
      _importState = { ..._importState, status: 'error', error: GENERIC_IMPORT_ERROR };
      trackEvent('import_failed');
    }
  },

  reset() {
    _importState = { status: 'idle', files: [] };
  }
};

// ===== Persistence: saveActivities (mirrors Go's saveActivities) =====
// sourceFileId links every saved activity back to the StoredFitFile it was
// parsed from (see fitFilesStore.reparseAll below) - omitted when re-parsing
// isn't the caller's concern (there is none today, but keeping it optional
// rather than required avoids forcing every future caller to have one).
const ACTIVITY_TABLES = [db.activities, db.activityRecords, db.activityLaps, db.activityLengths, db.activityEfforts];
// Everything one imported file writes: its stored copy plus its activities.
const IMPORT_TABLES = [db.fitFiles, db.fitFileBlobs, ...ACTIVITY_TABLES];

async function saveActivities(acts: ParsedActivity[], sourceFileId?: number): Promise<number> {
  return db.transaction('rw', ACTIVITY_TABLES, async () => {
    let count = 0;

    // Re-parsing an already-stored file (either a fresh import's own write,
    // or "Re-parse stored files" picking up a parser fix) must match each
    // newly-parsed session back to its own existing row *by position within
    // the file* (Nth session -> Nth existing activity for this
    // sourceFileId, ordered by id - the order they were originally
    // inserted in, since FIT sessions parse in file order - the same
    // position-matching convention fit-parser.ts already uses for
    // sessionZones/recoveryHrEvents). Matching on [date+sport] instead
    // breaks the moment a parser fix legitimately changes either field: the
    // sport_profile_name fix that turned a stale "Generic" activity's real
    // sport into "Bouldering" on re-parse no longer found the old "Generic"
    // row under the new sport, so it added a second, duplicate activity
    // instead of correcting the first.
    const existingForFile = sourceFileId !== undefined ? await db.activities.where('sourceFileId').equals(sourceFileId).sortBy('id') : [];

    for (let i = 0; i < acts.length; i++) {
      const pa = acts[i]!;
      // Falls back to a [date+sport] + start-time match when this session
      // has no by-position match under its own sourceFileId (a plain
      // re-import of an identical file picks up a brand-new sourceFileId
      // with no existing rows yet, so this is what keeps re-importing the
      // same file idempotent instead of duplicating it). The start time is
      // what stops a second same-sport session that day from overwriting
      // the first - see findExistingActivity.
      const existing =
        existingForFile[i] ??
        findExistingActivity(
          await db.activities.where('[date+sport]').equals([pa.activity.date, pa.activity.sport]).sortBy('id'),
          pa.activity
        );

      let activityId: number;
      if (existing) {
        await db.activities.update(existing.id!, {
          sport: pa.activity.sport,
          date: pa.activity.date,
          durationMin: pa.activity.durationMin,
          elapsedDurationMin: pa.activity.elapsedDurationMin,
          distanceKm: pa.activity.distanceKm,
          avgHR: pa.activity.avgHR,
          maxHR: pa.activity.maxHR,
          calories: pa.activity.calories,
          avgCadence: pa.activity.avgCadence,
          maxCadence: pa.activity.maxCadence,
          ascentM: pa.activity.ascentM,
          descentM: pa.activity.descentM,
          avgSpeedKmh: pa.activity.avgSpeedKmh,
          maxSpeedKmh: pa.activity.maxSpeedKmh,
          bestPaceMinPerKm: pa.activity.bestPaceMinPerKm,
          avgStrideLengthM: pa.activity.avgStrideLengthM,
          timeInZoneSec: pa.activity.timeInZoneSec,
          hrZoneBoundaries: pa.activity.hrZoneBoundaries,
          aerobicTrainingEffect: pa.activity.aerobicTrainingEffect,
          anaerobicTrainingEffect: pa.activity.anaerobicTrainingEffect,
          workoutFeel: pa.activity.workoutFeel,
          workoutRpe: pa.activity.workoutRpe,
          startTimeLabel: pa.activity.startTimeLabel,
          startUtc: pa.activity.startUtc,
          sweatLossMl: pa.activity.sweatLossMl,
          recoveryHrBpm: pa.activity.recoveryHrBpm,
          garminVo2Max: pa.activity.garminVo2Max,
          recoveryTimeHours: pa.activity.recoveryTimeHours,
          poolLengthM: pa.activity.poolLengthM,
          swimActiveDurationMin: pa.activity.swimActiveDurationMin,
          ...(sourceFileId !== undefined ? { sourceFileId } : {})
        });
        activityId = existing.id!;
      } else {
        // parseFIT sets a placeholder id of 0 on every freshly-parsed activity.
        // Dexie/IndexedDB treats an explicit 0 on an auto-increment key as a
        // real key request rather than "generate one" (0 is a valid key), so
        // passing pa.activity through as-is claims primary key 0 for the
        // first-ever import and throws ConstraintError on ever import after
        // that. Strip it so the auto-increment actually assigns a fresh id.
        const { id: _placeholderId, ...newActivity } = pa.activity;
        activityId = await db.activities.add({
          ...newActivity,
          ...(sourceFileId !== undefined ? { sourceFileId } : {})
        } as Activity);
      }

      // Replace records, and the efforts summary derived from them
      await db.activityRecords.where('activityId').equals(activityId).delete();
      if (pa.records.length > 0) {
        await db.activityRecords.bulkAdd(
          pa.records.map(r => ({ ...r, activityId }))
        );
      }
      await db.activityEfforts.put(effortsForParsed(activityId, pa));

      // Replace laps
      await db.activityLaps.where('activityId').equals(activityId).delete();
      if (pa.laps.length > 0) {
        await db.activityLaps.bulkAdd(
          pa.laps.map(l => ({ ...l, activityId }))
        );
      }

      // Replace pool lengths (pool-swim only; empty for every other sport)
      await db.activityLengths.where('activityId').equals(activityId).delete();
      if (pa.lengths.length > 0) {
        await db.activityLengths.bulkAdd(
          pa.lengths.map(l => ({ ...l, activityId }))
        );
      }
      count++;
    }
    return count;
  });
}

// ===== Stored FIT Files =====
// Raw bytes of every successfully-imported .fit file, kept so activities can
// be re-derived after a parser fix (see fit-parser.ts's changelog-style
// comments) without the user re-uploading anything.
export interface ReparseResult {
  filesReparsed: number;
  activitiesUpdated: number;
  errors: string[];
}

let _fitFileCount = $state(0);
let _fitFileTotalBytes = $state(0);
let _lastImportedAt = $state<string | null>(null);

// Re-parse is tracked here rather than as local state in SettingsPanel so it
// survives the panel/modal being closed and reopened mid-run: reparseAll()
// keeps going in the background regardless of which component is mounted,
// and without store-level state the UI had no way to reflect that - it just
// silently reset to "idle", making a still-running re-parse look finished
// or lost.
let _reparsing = $state(false);
let _reparseProgress = $state<{ done: number; total: number } | null>(null);
let _reparseResult = $state<ReparseResult | null>(null);

export const fitFilesStore = {
  get count() { return _fitFileCount; },
  get totalBytes() { return _fitFileTotalBytes; },
  // Most recent StoredFitFile.importedAt, for the header's real "synced"
  // label - null until at least one .fit file has been imported.
  get lastImportedAt() { return _lastImportedAt; },
  get reparsing() { return _reparsing; },
  get reparseProgress() { return _reparseProgress; },
  get reparseResult() { return _reparseResult; },

  async load() {
    // One cursor pass over the (small) metadata rows: the byte total needs
    // every row anyway, so count and latest come along rather than costing
    // queries of their own - and no array of every row is built.
    let count = 0;
    let totalBytes = 0;
    let latest: string | null = null;
    await db.fitFiles.each((f) => {
      count++;
      totalBytes += f.size;
      if (latest === null || f.importedAt > latest) latest = f.importedAt;
    });
    _fitFileCount = count;
    _fitFileTotalBytes = totalBytes;
    _lastImportedAt = latest;
  },

  // Re-parses every stored .fit file and upserts the result over the
  // existing activities (same by-position upsert saveActivities always
  // uses), so this picks up any parser change since the original import -
  // the cadence fix being the motivating example - with no re-upload.
  // Progress/result live on the store (not just the return value) so any
  // mounted component can reflect an in-flight run, including one that
  // wasn't the caller that started it.
  async reparseAll(): Promise<ReparseResult> {
    if (_reparsing) return _reparseResult ?? { filesReparsed: 0, activitiesUpdated: 0, errors: [] };
    _reparsing = true;
    _reparseResult = null;
    let pool: FitParsePool | null = null;
    try {
      // Metadata rows only: each file's bytes are read from fitFileBlobs
      // once a worker is free for it, so a large history is never all in
      // memory at once.
      const files = await db.fitFiles.toArray();
      _reparseProgress = { done: 0, total: files.length };
      // Parsed in the same worker pool as an import (several at once, off
      // the main thread), saved one at a time.
      pool = createFitParsePool(Math.max(1, files.length));
      const inFlight = createLimiter(pool.size * 2);
      const enqueueWrite = createWriteQueue();
      let activitiesUpdated = 0;
      let done = 0;
      // Per file, so the errors list in file order whichever finishes first.
      const fileErrors: (string | undefined)[] = [];
      await Promise.all(
        files.map((f, i) =>
          inFlight(async () => {
            const format = workoutFormat(f.filename);
            let stage: 'read' | 'parse' | 'save' = 'read';
            let bytes: Uint8Array = new Uint8Array(0);
            let missing = false;
            try {
              const activities = await pool!.parse({
                format,
                read: async () => {
                  const blob = await db.fitFileBlobs.get(f.id);
                  if (!blob) {
                    missing = true;
                    throw new Error('the stored copy is missing');
                  }
                  bytes = blob.data;
                  stage = 'parse';
                  return bytes;
                }
              });
              stage = 'save';
              await enqueueWrite(async () => {
                activitiesUpdated += await saveActivities(activities, f.id);
              });
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              if (stage === 'read') {
                fileErrors[i] = missing ? 'The stored copy of this file is missing. Import it again.' : GENERIC_IMPORT_ERROR;
              } else {
                const reason = stage === 'save' ? 'save_error' : format === 'gpx' ? gpxFailureReason(bytes, message) : fitFailureReason(bytes, message);
                fileErrors[i] = failureMessage(reason);
              }
            } finally {
              _reparseProgress = { done: ++done, total: files.length };
            }
          })
        )
      );
      const errors = files.flatMap((f, i) => (fileErrors[i] ? [`${f.filename}: ${fileErrors[i]}`] : []));
      await activitiesStore.load();
      _reparseResult = { filesReparsed: files.length, activitiesUpdated, errors };
      return _reparseResult;
    } finally {
      pool?.terminate();
      _reparsing = false;
      _reparseProgress = null;
    }
  }
};

// ===== Backup (export / restore) =====
// See lib/backup.ts for the archive format. Export packs every stored raw
// file plus settings; restore feeds the files back through importFiles (so
// they're parsed by the current parser and show the usual import progress),
// then applies the settings.
export interface BackupExport {
  blob: Blob;
  filename: string;
  fileCount: number;
  // Activities imported before raw files were kept - they have no file to
  // export, so a backup can't carry them.
  unlinkedActivityCount: number;
}

export interface BackupRestoreResult {
  filesInBackup: number;
  activitiesImported: number;
  errors: string[];
  missing: string[];
  settingsRestored: number;
  sampleRemoved: number;
}

let _backupBusy = $state<'idle' | 'exporting' | 'restoring'>('idle');

export const backupStore = {
  get busy() { return _backupBusy; },

  async exportAll(): Promise<BackupExport> {
    _backupBusy = 'exporting';
    try {
      const metas = await db.fitFiles.orderBy('id').toArray();
      const files = [];
      for (const m of metas) {
        const blob = await db.fitFileBlobs.get(m.id);
        if (blob) files.push({ filename: m.filename, importedAt: m.importedAt, data: blob.data });
      }
      const settings = Object.fromEntries((await db.settings.toArray()).map((s) => [s.key, s.value]));
      const now = new Date();
      const zipped = await createBackupZip(files, settings, CURRENT_VERSION, now.toISOString());
      const unlinkedActivityCount = await db.activities.filter((a) => a.sourceFileId === undefined).count();
      trackEvent('backup_exported', { files: files.length });
      return {
        blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
        filename: backupFilename(now),
        fileCount: files.length,
        unlinkedActivityCount
      };
    } finally {
      _backupBusy = 'idle';
    }
  },

  async restore(file: File): Promise<BackupRestoreResult> {
    _backupBusy = 'restoring';
    try {
      // The whole zip is read into memory to unpack it.
      if (file.size > MAX_ZIP_BYTES) throw new Error(ZIP_TOO_LARGE_MESSAGE);
      const { manifest, files, missing, skipped } = await readBackupZip(new Uint8Array(await file.arrayBuffer()));
      const fileCount = files.length;
      let result: ImportState['result'];
      if (fileCount > 0 || skipped.length > 0) {
        // splice: the unpacked arrays aren't kept alongside their Files.
        const unpacked = files.splice(0).map((f) => new File([f.data as BlobPart], f.filename));
        await importStore.importFiles(unpacked, skipped.map((s) => ({ name: s.filename, reason: s.reason })));
        result = importStore.state.result;
      }
      // A plain zip of workout files (no manifest) is just an import.
      if (!manifest) {
        trackEvent('workout_zip_imported', { files: fileCount });
        return {
          filesInBackup: fileCount + skipped.length,
          activitiesImported: result?.imported ?? 0,
          errors: result?.errors ?? [],
          missing,
          settingsRestored: 0,
          sampleRemoved: result?.sampleRemoved ?? 0
        };
      }
      const settingsRestored = Object.keys(manifest.settings).length;
      if (settingsRestored > 0) await settingsStore.save(manifest.settings);
      trackEvent('backup_restored', { files: fileCount });
      return {
        filesInBackup: manifest.files.length,
        activitiesImported: result?.imported ?? 0,
        errors: result?.errors ?? [],
        missing,
        settingsRestored,
        sampleRemoved: result?.sampleRemoved ?? 0
      };
    } finally {
      _backupBusy = 'idle';
    }
  }
};

// ===== Device Folder Sync =====
// Optional automatic import from a watch/device connected as a mounted
// folder (File System Access API - Chrome/Edge/Opera only, no Firefox or
// Safari support). The user grants read access to a folder once - typically
// the watch's GARMIN/ACTIVITY directory over USB - and the directory handle
// is then kept in `db.deviceSync` so later visits can re-request permission
// on that same folder (`sync()`) instead of picking it again. Drag-and-drop
// import (ImportPanel's dropzone) remains the only path on unsupported
// browsers - `supported` gates the UI entirely rather than showing a button
// that would just fail.
let _deviceSyncHandle: FileSystemDirectoryHandle | null = null;
let _deviceSyncName = $state<string | null>(null);
let _deviceSyncLastAt = $state<string | null>(null);
let _deviceSyncing = $state(false);
let _deviceSyncError = $state<string | null>(null);
let _deviceSyncFoundCount = $state<number | null>(null);

// Recurses into every subfolder looking for .fit files - Garmin nests
// activities a couple of levels deep (GARMIN/ACTIVITY/*.FIT) but this stays
// generic so it also works if the user points it at the device's root or at
// a different manufacturer's folder layout (Wahoo, Coros, ...).
async function walkForFitFiles(dir: FileSystemDirectoryHandle): Promise<File[]> {
  const out: File[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === 'file') {
      if (entry.name.toLowerCase().endsWith('.fit')) out.push(await entry.getFile());
    } else {
      out.push(...(await walkForFitFiles(entry)));
    }
  }
  return out;
}

export const deviceSyncStore = {
  supported: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
  get connected() { return _deviceSyncHandle !== null; },
  get name() { return _deviceSyncName; },
  get lastSyncedAt() { return _deviceSyncLastAt; },
  get syncing() { return _deviceSyncing; },
  get error() { return _deviceSyncError; },
  // Files found by the most recent sync that weren't already imported (by
  // filename) - null before any sync has run this session.
  get lastFoundCount() { return _deviceSyncFoundCount; },

  async load() {
    // Cleared when there's no row too, so "Reset all data" forgets the
    // folder in this session as well as on disk.
    const row = await db.deviceSync.get('default');
    _deviceSyncHandle = row?.handle ?? null;
    _deviceSyncName = row?.name ?? null;
    _deviceSyncLastAt = row?.lastSyncedAt ?? null;
  },

  async connect() {
    if (!this.supported) return;
    _deviceSyncError = null;
    try {
      const handle = await window.showDirectoryPicker({ id: 'fit-device-sync', mode: 'read' });
      _deviceSyncHandle = handle;
      _deviceSyncName = handle.name;
      await db.deviceSync.put({ key: 'default', name: handle.name, handle, lastSyncedAt: null });
      await this.sync();
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return; // user dismissed the picker
      _deviceSyncError = e instanceof Error ? e.message : String(e);
    }
  },

  async disconnect() {
    await db.deviceSync.delete('default');
    _deviceSyncHandle = null;
    _deviceSyncName = null;
    _deviceSyncLastAt = null;
    _deviceSyncFoundCount = null;
    _deviceSyncError = null;
  },

  async sync() {
    if (!_deviceSyncHandle || _deviceSyncing) return;
    _deviceSyncing = true;
    _deviceSyncError = null;
    try {
      // Permission is per-handle and can lapse between visits (browsers
      // don't persist it indefinitely) - re-request it here rather than
      // assuming an earlier grant still holds. This must run from a user
      // gesture (the "Sync" button click), which it always does since
      // sync() is only ever called from connect()/the button handler.
      const perm = await _deviceSyncHandle.queryPermission({ mode: 'read' });
      const granted = perm === 'granted' || (await _deviceSyncHandle.requestPermission({ mode: 'read' })) === 'granted';
      if (!granted) {
        _deviceSyncError = 'Lapline needs permission to read that folder. Choose Sync now and allow access when asked.';
        return;
      }
      const found = await walkForFitFiles(_deviceSyncHandle);
      // Skip files already imported (by filename) so re-syncing a folder
      // full of old activities doesn't re-store and re-parse everything on
      // every click - only genuinely new files reach importStore. Read
      // straight off the filename index, without loading the rows.
      const known = new Set((await db.fitFiles.orderBy('filename').uniqueKeys()) as string[]);
      const newFiles = found.filter((f) => !known.has(f.name));
      _deviceSyncFoundCount = newFiles.length;
      if (newFiles.length > 0) {
        await importStore.importFiles(newFiles);
      }
      _deviceSyncLastAt = new Date().toISOString();
      await db.deviceSync.put({ key: 'default', name: _deviceSyncName!, handle: _deviceSyncHandle, lastSyncedAt: _deviceSyncLastAt });
    } catch (e) {
      _deviceSyncError = e instanceof Error ? e.message : String(e);
    } finally {
      _deviceSyncing = false;
    }
  }
};

// Initialize all stores
export async function initStores(): Promise<void> {
  await Promise.all([
    entriesStore.load(),
    activitiesStore.load(),
    goalsStore.load(),
    settingsStore.load(),
    fitFilesStore.load(),
    deviceSyncStore.load()
  ]);
}

// Wipes every table and refreshes all reactive stores to match. Used by
// Settings > "Reset all data".
export async function resetAllStores(): Promise<void> {
  await resetAllData();
  await initStores();
  // Otherwise a stale "3 Files · 3 Activities imported" summary (or file
  // list) from before the reset would still show the next time Import is
  // opened, even though every one of those files/activities is now gone.
  importStore.reset();
}