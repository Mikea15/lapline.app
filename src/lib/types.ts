// lib/types.ts
// TypeScript interfaces mirroring the Go models from models.go
// All field names and types match the JSON tags for API compatibility.

export interface Entry {
  id: number;
  date: string;           // "YYYY-MM-DD"
  weight: number;         // kg
  mood: number;           // 0-5
  steps: number;
  sleep: number;          // hours
  note: string;
  createdAt: string;      // RFC3339 UTC
}

export interface Activity {
  id: number;
  date: string;           // "YYYY-MM-DD"
  sport: string;
  durationMin: number;      // FIT total_timer_time - excludes auto-paused/stopped stretches
  // FIT total_elapsed_time - total wall-clock time, including pauses.
  // Optional like sourceFileId above: undefined on activities imported
  // before this field existed, until a re-parse backfills it - callers
  // fall back to durationMin, same contract as everywhere else here.
  elapsedDurationMin?: number;
  distanceKm: number;
  avgHR: number;
  maxHR: number;
  calories: number;
  avgCadence: number;
  maxCadence: number;
  ascentM: number;
  descentM: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  bestPaceMinPerKm: number;  // fastest qualifying lap pace, 0 if not available
  avgStrideLengthM: number;
  timeInZoneSec: number[];   // [zone1..zone5] seconds, [] if the device didn't record zones
  hrZoneBoundaries: number[]; // [zone1High..zone5High] bpm, [] if unavailable
  aerobicTrainingEffect: number;   // Firstbeat's 0-5 scale; 0 = not recorded
  anaerobicTrainingEffect: number; // same scale; 0 = not recorded
  workoutFeel: number | null; // Garmin's post-activity "how did that feel" 0-100 scale; null = prompt unanswered/unsupported
  workoutRpe: number | null;  // paired 0-10 Rate of Perceived Exertion; null = unanswered/unsupported
  startTimeLabel: string;    // "HH:MM" local wall-clock start time, display-only; '' if unavailable
  // The real start instant, ISO UTC ("2026-06-01T22:30:00.000Z") - what
  // anything needing the actual time (weather hour, recovery countdown)
  // reads, since startTimeLabel is tied to the browser's timezone at
  // import. undefined on activities imported before this field existed
  // until a re-parse backfills it - read it via activityStart()
  // (lib/activity-time.ts), which falls back to date + startTimeLabel.
  // Unindexed, so no Dexie schema version bump needed.
  startUtc?: string;
  sweatLossMl: number;       // estimated fluid loss; 0 = not recorded
  recoveryHrBpm: number;     // real device measurement ~2 min after stopping; 0 = not recorded
  // Garmin/Firstbeat's own on-device estimates, from the FIT `activity_metrics`
  // message (only present on watches with Firstbeat support, and only for
  // sports it computes VO2max for - running/cycling, not e.g. strength). Kept
  // separate from this app's own computed VO2max (lib/vo2max.ts, a
  // Daniels-Gilbert VDOT estimate from real best-effort pace) rather than
  // blended into it - the two are different methodologies over different
  // inputs, and conflating them into one number would misrepresent both.
  garminVo2Max: number;      // ml/kg/min, rounded to 1dp; 0 = not recorded
  recoveryTimeHours: number; // Garmin's own "time until fully recovered" estimate; 0 = not recorded
  // Fixed pool length in metres for a pool-swim session (FIT's own
  // per-session constant); 0 for non-pool-swim activities or if the device
  // didn't record it. FIT `length` messages (see SwimLength below) don't
  // carry their own distance, so this is what turns each length into a
  // real distance/pace.
  poolLengthM: number;
  // Pool-swim only: real total active (swum) time in minutes, summed from
  // this activity's own `length` messages' `active` lengths - excludes
  // every real rest/idle length, unlike durationMin (total_timer_time),
  // which includes them. Backs the real "moving pace" this app's swim rate
  // (Activities ledger, Tape hero, and the "length by length" tile grid's
  // own vs-average delta all read from the same rateSortValue()) uses
  // instead of an elapsed-including-rest average. undefined for every
  // non-pool-swim activity, and for a pool swim imported before this field
  // existed until a re-parse backfills it - same "undefined until
  // re-parsed" contract as elapsedDurationMin/sourceFileId above.
  swimActiveDurationMin?: number;
  // Links to the StoredFitFile this activity was parsed from, so a future
  // parser fix can be re-applied without re-uploading anything. undefined on
  // activities imported before this field existed - they aren't re-parseable
  // until the source file is re-imported once.
  sourceFileId?: number;
  // Reverse-geocoded place name for the route's start coordinate (see
  // lib/geocode.ts), only ever populated when Settings > "Location lookup"
  // is turned on (opt-in - it means sending this activity's real GPS
  // coordinate to an external service). undefined = never looked up
  // (feature off, not yet opened, or the last lookup failed temporarily and
  // will be retried); '' = looked up but no place name was found (or no GPS). Unindexed, so no Dexie schema version bump needed.
  locationLabel?: string;
  // Weather condition word (e.g. "Clear", "Rain") for this activity's
  // date/start time/GPS start coordinate (see lib/weather.ts), same opt-in/
  // undefined/'' contract as locationLabel above, gated on its own
  // Settings > "Weather lookup" toggle.
  weatherCondition?: string;
}

// Metadata for an imported .fit file, kept so activities can be re-derived
// after a parser fix without the user re-uploading anything. A single file
// can back multiple Activity rows (multi-session FIT files). The raw bytes
// live separately in FitFileBlob (same id) - every app boot lists this table
// to show the stored-files count/size, and that listing must never have to
// read every file's full binary payload just to report a count.
export interface StoredFitFile {
  id: number;
  filename: string;
  size: number;       // bytes; mirrors the blob's byteLength for display without touching it
  importedAt: string; // RFC3339 UTC
}

// The raw bytes of an imported .fit file, keyed by its StoredFitFile's id.
// Only ever read when actually re-parsing (Settings > "Re-parse stored
// files") or writing a fresh import - never on the app's normal boot path.
export interface FitFileBlob {
  id: number;
  data: Uint8Array;
}

// A remembered File System Access API directory handle (e.g. a watch's
// GARMIN/ACTIVITY folder over USB), kept so the user grants folder access
// once and later visits can just re-request permission on the same handle
// rather than picking the folder again. Single row, fixed key - this app
// only supports one connected device folder at a time.
export interface DeviceSyncHandle {
  key: 'default';
  name: string;                  // the folder's own name, for display
  handle: FileSystemDirectoryHandle;
  lastSyncedAt: string | null;   // RFC3339 UTC; null until the first sync completes
}

export interface RecordPoint {
  t: number;              // seconds since activity start
  hr: number;             // bpm
  cadence: number;        // steps/min or rpm
  power: number;          // watts
  distance: number;       // cumulative metres
  temp: number;           // Celsius
  altitude: number;       // metres
  speed: number;          // km/h
  perfCondition: number | null; // Garmin performance condition; null = not recorded (0 is a valid reading)
  lat: number | null;     // degrees; null = no GPS fix (indoor/treadmill activities)
  lon: number | null;     // degrees; null = no GPS fix
}

export interface Lap {
  index: number;
  startOffsetSec: number; // seconds from activity start
  elapsedSec: number;
  distanceM: number;
  avgPaceMinPerKm: number;
  avgHR: number;
  maxHR: number;
  avgCadence: number;
}

// One pool length (one wall-to-wall lap of the pool, either actively swum
// or a resting/idle pause) from the FIT `length` message - much
// finer-grained than Lap above, which in a pool-swim workout usually
// groups several lengths plus rest rather than corresponding to one
// length. This is what backs the sport-specific swim splits display,
// instead of forcing swim data through the running-shaped Lap table.
export interface SwimLength {
  index: number;
  startOffsetSec: number; // seconds from activity start
  elapsedSec: number;
  active: boolean;        // false = a rest/idle interval, not a swum length
  strokeCount: number;    // 0 if unavailable or a rest length
  strokeRate: number;     // strokes/min, 0 if unavailable or a rest length
  stroke: string;         // 'freestyle' | 'backstroke' | 'breaststroke' | 'butterfly' | 'drill' | 'mixed' | '' if unavailable/rest
}

export interface ParsedActivity {
  activity: Activity;
  records: RecordPoint[];
  laps: Lap[];
  lengths: SwimLength[];
}

export interface ActivityDetail extends Activity {
  t: number[];
  hr: number[];
  cadence: number[];
  power: number[];
  distance: number[];
  temperature: number[];
  altitude: number[];
  speed: number[];
  perfCondition: (number | null)[];
  lat: (number | null)[];
  lon: (number | null)[];
  laps: Lap[];
  lengths: SwimLength[];
}

// Goal/Entry logging has no home in the current UI (the dashboard replaced
// it - see design_handoff_sports_dashboard), but the interfaces and their
// Dexie tables are kept so any data a user already logged isn't discarded.
export interface Goal {
  key: string;            // "weight" | "sleep" | "workouts"
  target: number;
  updatedAt: string;      // RFC3339 UTC
}

export type GoalKey = 'weight' | 'sleep' | 'workouts';
export const GOAL_KEYS: GoalKey[] = ['weight', 'sleep', 'workouts'];

export interface Setting {
  key: string;            // "max_hr"
  value: string;
}

export type SettingKey = 'max_hr' | 'unit_system';

export const SETTING_KEYS: SettingKey[] = ['max_hr', 'unit_system'];

export interface ImportResult {
  files: number;
  imported: number;
  errors: string[];
}

export interface ExportFormat {
  format: 'csv' | 'json';
}

// Top-level dashboard screens (the sidebar's 5 nav items). Settings/Import
// are modals opened from the header, not screens of their own.
export type Screen = 'today' | 'activity' | 'calendar' | 'trends' | 'records';