// lib/fit-parser.ts
// FIT file parser using fit-file-parser (pure JS).
// Simple, reliable, no WASM complexity needed for MVP.

import type { ParsedActivity, Lap, SwimLength } from './types';
import { sportFamily, type SportFamily } from './sport-color';
// Type-only import - erased at build time (verbatimModuleSyntax), so this
// doesn't pull the library into the bundle eagerly. The actual parser is
// still loaded via the dynamic import in parseFIT() below.
import type FitParserType from 'fit-file-parser';

// v5 generates its entire type surface from Garmin's own pinned FIT SDK
// (see plan-fit-parser.md's migration notes) but its public entry point
// doesn't export the parsed-result types by name - fit-file-parser/dist/
// fit_types.js isn't in the package's `exports` map, so it can't be
// deep-imported even for types-only. Deriving them from parseAsync's own
// return type gets the same real, generated types without that: if a
// future version renames/removes a field this app reads, tsc catches it
// here instead of the field silently reading `undefined` at runtime the
// way the previous hand-written `?:` interfaces below would have.
type ParsedFit = Awaited<ReturnType<FitParserType['parseAsync']>>;
// Only FitSession needs a name of its own (getSessionWindow's parameter
// below) - records/laps/time_in_zone/events are all consumed through
// `parsed.<field>` directly, so their element types stay inferred rather
// than aliased for no reason.
type FitSession = NonNullable<ParsedFit['sessions']>[number];

function getDateString(startTime: Date | undefined): string {
  if (!startTime) return '0001-01-01';
  return startTime.toISOString().split('T')[0] ?? '0001-01-01';
}

// Display-only wall-clock start time ("HH:MM", 24h) - deliberately read via
// the browser's local time, not the UTC getDateString() above, since a
// runner cares what the clock on their wall said when they started, not
// what UTC instant that was. The "date" field stays UTC-based (it's the
// upsert key + every daysAgo/bucket calculation's input) - this is a
// separate, purely cosmetic field so changing it can't affect any of that.
function getStartTimeLabel(startTime: Date | undefined): string {
  if (!startTime) return '';
  return `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`;
}

// FIT's sport enum uses "generic" (value 0) as a placeholder meaning "no
// specific sub-type set". Garmin devices leave sub_sport as "generic" for
// the overwhelming majority of ordinary runs/rides, so treating it as a
// real sport name would mislabel most real-world activities as "generic"
// instead of "running"/"cycling"/etc. Empty string is the same situation
// for older/other devices that omit the field entirely.
// v5's real Sport/SubSport types are `<big string-literal union> | number` -
// unlike the old hand-written `sport?: string`, they now reveal that an
// unrecognized FIT sport enum value (one the library's pinned SDK snapshot
// has no name for) comes through as its raw numeric id, not a string. The
// old code silently assumed string and would have broken on that case.
function isSpecificSport(value: string | number | undefined): value is string {
  return typeof value === 'string' && value !== '' && value.toLowerCase() !== 'generic';
}

// Garmin's own standard default activity-profile names - what a fresh
// device already calls each of its built-in profiles before a user
// renames one. A sport_profile_name matching one of these (for the sport
// family it actually names) is just restating the sport FIT already told
// us, so it's not worth appending; anything else - "Footy" on a plain
// Running profile, for example - is the user's own real customization and
// is genuinely new information.
const DEFAULT_PROFILE_NAME_FAMILY: Record<string, SportFamily> = {
  run: 'running',
  running: 'running',
  bike: 'cycling',
  biking: 'cycling',
  cycle: 'cycling',
  cycling: 'cycling',
  swim: 'pool-swim',
  'pool swim': 'pool-swim',
  swimming: 'pool-swim',
  cardio: 'cardio',
  'cardio training': 'cardio',
  strength: 'cardio',
  training: 'cardio'
};

function isDefaultProfileName(profileName: string, resolvedFamily: SportFamily): boolean {
  return DEFAULT_PROFILE_NAME_FAMILY[profileName.trim().toLowerCase()] === resolvedFamily;
}

function resolveSport(sport: string | number | undefined, subSport: string | number | undefined, profileName: string | undefined): string {
  const specific = isSpecificSport(subSport) ? subSport : isSpecificSport(sport) ? sport : null;
  if (specific !== null) {
    // FIT already gave us a real, specific sport/sub-sport (e.g. "running")
    // - keep it as-is so sportFamily()/pace math/coloring, which all match
    // on this string's own keywords, keep working. But a device profile
    // built on a generic FIT sport type can still be a genuinely different
    // real activity ("Footy", tracked as a plain Running profile) - when
    // the user's own profile name isn't just the family's default label,
    // append it so that real distinction isn't silently dropped.
    const trimmedName = profileName?.trim();
    if (trimmedName && !isDefaultProfileName(trimmedName, sportFamily(specific))) {
      return `${specific} (${trimmedName})`;
    }
    return specific;
  }
  // Both sport and sub_sport are the FIT "generic" placeholder (or an
  // unrecognized numeric enum) - a Garmin watch's own custom activity
  // profile (e.g. a "Bouldering" profile built on the catch-all Other/
  // Generic FIT sport type, since FIT has no dedicated climbing sport
  // value) still carries its real user-given name in session.sport_profile_name,
  // which the two checks above never look at. Real device data, not a
  // guess - falls through to the generic/numeric handling below when absent.
  if (profileName && profileName.trim() !== '') return profileName.trim();
  if (typeof subSport === 'number') return String(subSport);
  if (typeof sport === 'number') return String(sport);
  return subSport || sport || 'Unknown';
}

// Garmin's FIT `cadence` field for running records counts strikes of one leg
// only, not total steps - so raw values read as roughly half a real running
// cadence (e.g. 80 instead of the true ~160 steps/min). Cycling's cadence is
// already a whole crank-revolution count and needs no correction. Confirmed
// against this project's own stub FIT files: recreational-pace runs (~5:30/km)
// were reading avg_cadence ~80, implausible for real running (norms are
// 160-180 spm at that pace; halving explains the gap exactly).
function cadenceMultiplier(resolvedSport: string): number {
  return sportFamily(resolvedSport) === 'running' ? 2 : 1;
}

// A FIT file can contain multiple sessions (multi-sport/brick workouts, or
// simply multiple activities logged in one file). All records live in one
// flat, chronologically-ordered array, so each session's records must be
// bounded by that session's own [start, end) window — not just "timestamp
// >= this session's start" — otherwise every session after the first
// silently absorbs every later session's records too.
function getSessionWindow(s: FitSession): { start: number; end: number } {
  const start = s.start_time?.getTime() ?? 0;
  const durationMs = (s.total_elapsed_time || s.total_timer_time || 0) * 1000;
  // Record timestamps have 1-second resolution while total_elapsed_time carries
  // sub-second precision, so a strict duration-based cutoff routinely excludes
  // a session's last one or two records by a fraction of a second. A 1-second
  // grace period fixes that without meaningfully reopening the multi-session
  // bleed this window is meant to prevent (real session transitions are
  // seconds-to-minutes apart, not sub-second).
  const end = durationMs > 0 ? start + durationMs + 1000 : Number.POSITIVE_INFINITY;
  return { start, end };
}

// Best pace = the fastest ~1km auto-lap rather than the single fastest
// instantaneous GPS speed reading - a momentary GPS jitter spike in
// enhanced_max_speed would otherwise produce an unrealistic "best pace".
// A watch's barometric altimeter occasionally emits a single wildly wrong
// reading (a gust of wind, a hand over the vent, a brief sensor fault) -
// sane on either side, but a physically impossible metres-per-second jump
// and return for one sample. Left in, that one sample dominates the
// Elevation chart's vertical scale (and its min/max corner labels) far more
// than every real reading combined - e.g. a whole activity spent between
// 20-60m reading a single "-45m" spike. Detected as: a sample that deviates
// from what a straight line between its nearest real (nonzero) neighbours
// would predict by more than both an absolute threshold and an implied
// vertical rate no on-foot/bike/paddle sport can sustain even for a second -
// replaced with that straight-line interpolation rather than dropped, so
// the chart shows a smooth transition instead of a spike or a false dip to
// "no reading" (0 already means "no reading" everywhere else in this
// stream, so genuinely-missing samples are left alone). Doesn't touch
// ascentM/descentM - those come from the FIT session's own total_ascent/
// total_descent, the device's own on-device (already-filtered) estimate,
// not a sum over this raw per-second stream.
export function sanitizeAltitudeSpikes(records: { t: number; altitude: number }[]): number[] {
  const out = records.map((r) => r.altitude);
  const MAX_DEVIATION_M = 15;
  const MAX_VERTICAL_RATE_M_PER_S = 5;

  for (let i = 1; i < out.length - 1; i++) {
    if (out[i] === 0) continue;

    let p = i - 1;
    while (p >= 0 && out[p] === 0) p--;
    let n = i + 1;
    while (n < out.length && out[n] === 0) n++;
    if (p < 0 || n >= out.length) continue;

    const dtTotal = records[n]!.t - records[p]!.t;
    if (dtTotal <= 0) continue;
    const frac = (records[i]!.t - records[p]!.t) / dtTotal;
    const expected = out[p]! + (out[n]! - out[p]!) * frac;
    if (Math.abs(out[i]! - expected) < MAX_DEVIATION_M) continue;

    const dtToPrev = records[i]!.t - records[p]!.t;
    const dtToNext = records[n]!.t - records[i]!.t;
    const rateFromPrev = dtToPrev > 0 ? Math.abs(out[i]! - out[p]!) / dtToPrev : 0;
    const rateToNext = dtToNext > 0 ? Math.abs(out[n]! - out[i]!) / dtToNext : 0;
    if (rateFromPrev > MAX_VERTICAL_RATE_M_PER_S && rateToNext > MAX_VERTICAL_RATE_M_PER_S) {
      out[i] = expected;
    }
  }
  return out;
}

// Laps under 500m are skipped (partial/trailing laps aren't a fair split).
// Exported so gpx-parser.ts's own synthesized 1km laps follow the exact
// same rule rather than a duplicated, driftable copy of it.
export function computeBestPace(laps: Lap[]): number {
  let best = 0;
  for (const lap of laps) {
    if (lap.distanceM < 500) continue;
    const paceMinPerKm = lap.elapsedSec / (lap.distanceM / 1000) / 60;
    if (best === 0 || paceMinPerKm < best) best = paceMinPerKm;
  }
  return best;
}

export async function parseFIT(data: Uint8Array): Promise<ParsedActivity[]> {
  const { default: FitParser } = await import('fit-file-parser');

  const parser = new FitParser();
  const ab = data.buffer.slice(0) as ArrayBuffer;

  const parsed: ParsedFit = await parser.parseAsync(ab);

  const sessions = parsed.sessions ?? [];
  const allRecords = parsed.records ?? [];
  const allLaps = parsed.laps ?? [];
  // Pool-swim only: one FIT `length` message per pool length (active swim
  // or a resting/idle pause at the wall) - finer-grained than laps, which
  // in a swim workout usually group several lengths plus rest rather than
  // map 1:1 to one length. No other sport writes this message.
  const allLengths = parsed.lengths ?? [];
  // The session-level time_in_zone entry is timestamped at session *save*
  // time, which trails the elapsed-time-based session window by several
  // seconds (a real gap observed in real files) - a timestamp-window match
  // like records/laps use would miss it. FIT messages are always written in
  // chronological order though, and there's exactly one reference_mesg==='session'
  // entry per session, so matching by position (Nth session -> Nth
  // session-level zone entry) is reliable where timestamp-matching isn't.
  const sessionZones = (parsed.time_in_zone ?? []).filter((z) => z.reference_mesg === 'session');
  // The device measures recovery HR ~2 minutes after the timer stops, so it
  // always lands after the session's own window - matched by position
  // (Nth session -> Nth recovery_hr event) for the same reason sessionZones
  // is above: FIT messages are chronological, and multi-session files are rare.
  const recoveryHrEvents = (parsed.events ?? []).filter((e) => e.event === 'recovery_hr');
  // Garmin/Firstbeat's own on-device VO2max + recovery-time estimate, one
  // entry per session - matched by position for the same reason as
  // sessionZones/recoveryHrEvents above (only verified against this
  // project's own single-session stub files; a true multi-session/brick FIT
  // file would need re-checking that the Nth entry really is the Nth
  // session's before trusting this for that case).
  const activityMetrics = parsed.activity_metrics ?? [];
  const out: ParsedActivity[] = [];

  for (const [sessionIndex, s] of sessions.entries()) {
    const { start, end } = getSessionWindow(s);

    const dateStr = getDateString(s.start_time);
    const resolvedSport = resolveSport(s.sport, s.sub_sport, s.sport_profile_name);
    const cadenceMult = cadenceMultiplier(resolvedSport);

    // Laps belonging to this session, in order, with cumulative offsets.
    const laps: Lap[] = [];
    let cumulative = 0;
    let lapIndex = 0;
    for (const lap of allLaps) {
      const lapStart = lap.start_time?.getTime() ?? 0;
      if (lapStart < start || lapStart >= end) continue;
      const elapsedSec = lap.total_elapsed_time || lap.total_timer_time || 0;
      const distanceM = lap.total_distance || 0;
      laps.push({
        index: lapIndex++,
        startOffsetSec: cumulative,
        elapsedSec,
        distanceM,
        avgPaceMinPerKm: distanceM > 0 ? elapsedSec / (distanceM / 1000) / 60 : 0,
        avgHR: Math.round(lap.avg_heart_rate || 0),
        maxHR: Math.round(lap.max_heart_rate || 0),
        avgCadence: Math.round((lap.avg_cadence || 0) * cadenceMult)
      });
      cumulative += elapsedSec;
    }

    // Pool lengths belonging to this session, in order, with cumulative
    // offsets - same window-bounding approach as laps above, since a
    // multi-session file's length messages are chronological per session
    // too. avg_swimming_cadence is trusted as already being real strokes/
    // min (unlike running's watch-leg-only cadence quirk, there's no
    // documented equivalent halving issue for swimming in this project's
    // stub data - there's no swim stub file to confirm against directly,
    // so this is worth double-checking against a real device export before
    // fully trusting it).
    const lengths: SwimLength[] = [];
    let lengthCumulative = 0;
    let lengthIndex = 0;
    for (const len of allLengths) {
      const lenStart = len.start_time?.getTime() ?? 0;
      if (lenStart < start || lenStart >= end) continue;
      const elapsedSec = len.total_elapsed_time || len.total_timer_time || 0;
      lengths.push({
        index: lengthIndex++,
        startOffsetSec: lengthCumulative,
        elapsedSec,
        active: len.length_type === 'active',
        strokeCount: len.total_strokes || 0,
        strokeRate: Math.round(len.avg_swimming_cadence || 0),
        stroke: typeof len.swim_stroke === 'string' ? len.swim_stroke : ''
      });
      lengthCumulative += elapsedSec;
    }

    // Real active-only swim time (excludes every real rest/idle length) -
    // see Activity.swimActiveDurationMin's own comment for why this exists
    // alongside durationMin. Only meaningful when this session actually has
    // real length data; undefined (not 0) otherwise, so rateSortValue()
    // can tell "no active-time data" from "genuinely computed to zero".
    const swimActiveDurationMin =
      lengths.length > 0 ? lengths.filter((l) => l.active).reduce((sum, l) => sum + l.elapsedSec, 0) / 60 : undefined;

    const zoneEntry = sessionZones[sessionIndex];
    // Indices 1-5 of the 7-bucket array are zones 1-5 (index 0 is "below
    // zone 1", confirmed against real files by summing to total_timer_time).
    const timeInZoneSec = zoneEntry?.time_in_hr_zone?.slice(1, 6).map((v) => v || 0) ?? [];
    const hrZoneBoundaries = zoneEntry?.hr_zone_high_boundary?.slice(0, 5).map((v) => v || 0) ?? [];

    const metrics = activityMetrics[sessionIndex];
    // 0 on a sport activity_metrics doesn't compute VO2max for (e.g. strength
    // training) - confirmed against this project's own stub files, where
    // non-running sessions read exactly 0 rather than an absent field.
    const garminVo2Max = metrics?.vo2_max ? Math.round(metrics.vo2_max * 10) / 10 : 0;
    // recovery_time is in minutes - confirmed by cross-checking this
    // project's stub files' values (converted to hours) against the
    // effort-proportional range Garmin Connect's own "Recovery Time" shows
    // (a few hours for an easy session, up to ~70+ for a hard one).
    const recoveryTimeHours = metrics?.recovery_time ? Math.round(metrics.recovery_time / 60) : 0;

    const pa: ParsedActivity = {
      activity: {
        id: 0,
        date: dateStr,
        sport: resolvedSport,
        // fit-file-parser already applies FIT scale/unit conversion, so these
        // fields arrive in their final units (seconds, metres) rather than
        // the raw FIT integers (ms, cm, mm) that the old Go/tormoder port assumed.
        durationMin: (s.total_timer_time || 0) / 60,
        // FIT's own separate field: total wall-clock time from start to
        // finish, including any auto-paused/stopped stretches - genuinely
        // different from durationMin (total_timer_time, which excludes
        // them). Confirmed against this project's own real stub files: most
        // read identical (no pauses), but e.g. one real run reads 3861.1s
        // timer vs 3969.3s elapsed - 108s of real auto-paused time.
        elapsedDurationMin: (s.total_elapsed_time || s.total_timer_time || 0) / 60,
        distanceKm: (s.total_distance || 0) / 1000,
        avgHR: Math.round(s.avg_heart_rate || 0),
        maxHR: Math.round(s.max_heart_rate || 0),
        calories: Math.round(s.total_calories || 0),
        avgCadence: Math.round((s.avg_cadence || 0) * cadenceMult),
        maxCadence: Math.round((s.max_cadence || 0) * cadenceMult),
        ascentM: s.total_ascent || 0,
        descentM: s.total_descent || 0,
        avgSpeedKmh: (s.enhanced_avg_speed || 0) * 3.6,
        maxSpeedKmh: (s.enhanced_max_speed || 0) * 3.6,
        bestPaceMinPerKm: computeBestPace(laps),
        avgStrideLengthM: (s.avg_step_length || 0) / 1000,
        timeInZoneSec,
        hrZoneBoundaries,
        aerobicTrainingEffect: s.total_training_effect || 0,
        anaerobicTrainingEffect: s.total_anaerobic_training_effect || 0,
        workoutFeel: s.workout_feel ?? null,
        // fit-file-parser v5 reads workout_rpe at 10x its real scale (e.g. 40
        // for a real RPE of 4) - confirmed against this project's own stub
        // file against Garmin Connect's matching "RPE 4" entry for the same
        // activity. v4 returned the already-scaled value; v5 doesn't.
        workoutRpe: s.workout_rpe !== undefined ? s.workout_rpe / 10 : null,
        sweatLossMl: s.est_sweat_loss || 0,
        recoveryHrBpm: recoveryHrEvents[sessionIndex]?.data || 0,
        garminVo2Max,
        recoveryTimeHours,
        startTimeLabel: getStartTimeLabel(s.start_time),
        poolLengthM: s.pool_length || 0,
        ...(swimActiveDurationMin !== undefined ? { swimActiveDurationMin } : {})
      },
      records: [],
      laps,
      lengths
    };

    if (pa.activity.date === '0001-01-01') continue;

    for (const rec of allRecords) {
      const ts = rec.timestamp?.getTime() ?? 0;
      if (ts < start || ts >= end) continue;

      pa.records.push({
        t: Math.floor((ts - start) / 1000),
        hr: Math.round(rec.heart_rate || 0),
        cadence: Math.round((rec.cadence || 0) * cadenceMult),
        power: Math.round(rec.power || 0),
        distance: rec.distance || 0,
        temp: Math.round(rec.temperature || 0),
        altitude: rec.enhanced_altitude || 0,
        speed: (rec.enhanced_speed || 0) * 3.6,
        perfCondition: rec.garmin_performance_condition ?? null,
        lat: rec.position_lat ?? null,
        lon: rec.position_long ?? null
      });
    }

    const cleanAltitude = sanitizeAltitudeSpikes(pa.records);
    pa.records.forEach((r, i) => (r.altitude = cleanAltitude[i]!));

    out.push(pa);
  }

  return out;
}
