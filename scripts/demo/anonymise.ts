// scripts/demo/anonymise.ts - shared by make-demo-data.ts (the bundled
// sample sessions) and make-test-fixtures.ts (the unit tests' fixtures):
// turns real recordings into files that are safe to publish.
//
// Every random choice comes from a secret seed (see loadSeed) that is never
// committed, so the published files can't be mapped back to the real ones
// by re-running this script: each route gets its own rotation, its own
// place near TARGET, its own altitude offset and its own trim, and each
// output file its own whole-day time shift.
//
// FIT, per file:
// - Only the message types lib/fit-parser.ts actually reads are kept. That
//   drops device_info (serial numbers), user_profile (weight, age, name),
//   developer data and Garmin's undocumented messages.
// - file_id's serial number and product name are blanked; activity's
//   local_timestamp (it gives away the time zone) is cleared.
// - With GPS: the first and last ~500 m are cut off (records, laps, events),
//   and the session and lap totals that depend on them (time, distance,
//   speed, HR zones, and pro rata ascent, descent and calories) are
//   recomputed, so the route no longer starts or ends at a real doorstep.
//   Records that still pass within PRIVACY_RADIUS_M of the real start or
//   finish (loops) lose their position but keep the rest. Positions are then
//   rotated about the route's centre and moved to a random spot near TARGET,
//   keeping shapes and distances; altitudes move by a random offset.
// - Any other sint32 field whose value lies near the original route
//   (undocumented position fields) is cleared.
// GPX: the same trim (by track distance), privacy zone (those points are
// dropped), move and altitude offset; the exporting app's `creator` name is
// replaced. Time shifts are left to the callers (shiftFitTimestamps /
// shiftGpxDays).
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import { rewriteFit, type FitMessage } from '../../src/lib/fit-rewrite';

export interface LatLon {
  lat: number;
  lon: number;
}

// Vondelpark, Amsterdam - a public place, nowhere near the real recordings.
// Each route's centre lands somewhere within a few km of it.
export const TARGET: LatLon = { lat: 52.358, lon: 4.8686 };

// ----- The secret seed -----

/** Private (stub-data/ is never published) and git-ignored. */
export const SEED_FILE = 'stub-data/anonymise-seed.txt';
export const SEED_ENV = 'LAPLINE_ANONYMISE_SEED';

export function loadSeed(): string {
  const seed = process.env[SEED_ENV]?.trim() || (fs.existsSync(SEED_FILE) ? fs.readFileSync(SEED_FILE, 'utf8').trim() : '');
  if (seed.length < 32) {
    throw new Error(
      `No anonymisation seed: set ${SEED_ENV} or put one in ${SEED_FILE} (at least 32 characters), e.g.\n` +
        `  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > ${SEED_FILE}\n` +
        'A new seed gives every published file a new disguise (and new values in the tests that read them).'
    );
  }
  return seed;
}

/** A deterministic stream of numbers in [0, 1) for one key, unguessable without the seed. */
export function secretRandom(seed: string, key: string): () => number {
  let n = 0;
  return () => createHmac('sha256', seed).update(`${key}#${n++}`).digest().readUInt32BE(0) / 2 ** 32;
}

/** Random integer in [min, max]. */
export function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

// ----- Per-route disguise -----

export interface Disguise {
  rotateDeg: number;
  /** Where the (trimmed) route's centre ends up. */
  centre: LatLon;
  /** The route's lowest altitude ends up here, in metres (kept above 0, which the parsers read as "no reading"). */
  lowestAltM: number;
  /** Track distance cut from the start and from the end, in metres. */
  trimStartM: number;
  trimEndM: number;
}

const M_PER_DEG_LAT = 111_320;

export function makeDisguise(rand: () => number): Disguise {
  const bearing = rand() * 2 * Math.PI;
  const away = 500 + rand() * 2500; // metres from TARGET
  return {
    rotateDeg: rand() * 360,
    centre: {
      lat: TARGET.lat + (away * Math.cos(bearing)) / M_PER_DEG_LAT,
      lon: TARGET.lon + (away * Math.sin(bearing)) / (M_PER_DEG_LAT * Math.cos((TARGET.lat * Math.PI) / 180))
    },
    lowestAltM: 2 + rand() * 25,
    trimStartM: 450 + rand() * 200,
    trimEndM: 450 + rand() * 200
  };
}

/** Rotates by `rotateDeg` around `from`, then moves `from` onto `to`, keeping local distances. */
export function makeMover(from: LatLon, rotateDeg: number, to: LatLon): (p: LatLon) => LatLon {
  const rot = (rotateDeg * Math.PI) / 180;
  const cosF = Math.cos((from.lat * Math.PI) / 180);
  const cosT = Math.cos((to.lat * Math.PI) / 180);
  return ({ lat, lon }) => {
    const dy = lat - from.lat;
    const dx = (lon - from.lon) * cosF;
    const ry = dx * Math.sin(rot) + dy * Math.cos(rot);
    const rx = dx * Math.cos(rot) - dy * Math.sin(rot);
    return { lat: to.lat + ry, lon: to.lon + rx / cosT };
  };
}

const EARTH_R = 6_371_000;

function metresBetween(a: LatLon, b: LatLon): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

// Trimming by track distance leaves a loop that later passes its own start
// (or finish) showing it. Positions this close to the real start or finish
// are removed too, like a privacy zone: FIT records keep their time,
// distance and heart rate with no position; GPX points go.
const PRIVACY_RADIUS_M = 300;

function privacyZone(ends: (LatLon | null | undefined)[]): (p: LatLon) => boolean {
  const centres = ends.filter((e): e is LatLon => !!e);
  return (p) => centres.some((c) => metresBetween(c, p) < PRIVACY_RADIUS_M);
}

function boxCentre(points: LatLon[]): LatLon {
  let [minLat, maxLat, minLon, maxLon] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  return { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
}

// ----- FIT -----

const SEMI = 2 ** 31 / 180; // semicircles per degree
const NEAR_DEG = 1.5; // "near the original route" for catching undocumented positions
const MIN_KEPT_M = 1000; // refuse to publish a GPS route that would be (almost) all trimmed away

const KEEP = new Set([0, 12, 18, 19, 20, 21, 34, 49, 101, 140, 216]);
const FILE_ID_BLANK = [3, 5, 8]; // serial_number, number, product_name
const ACTIVITY_LOCAL_TIMESTAMP = 5;
const ZONE = { referenceMesg: 0, referenceIndex: 1, hrTime: 2, hrHigh: 6 }; // time_in_zone

// Field numbers per message (FIT profile).
const SESSION = { start: 2, startLat: 3, startLon: 4, elapsed: 7, timer: 8, distance: 9, calories: 11, speed: 14, ascent: 22, descent: 23, endLat: 38, endLon: 39, enhancedSpeed: 124 };
const LAP = { start: 2, startLat: 3, startLon: 4, endLat: 5, endLon: 6, elapsed: 7, timer: 8, distance: 9, calories: 11, speed: 13, ascent: 21, descent: 22, enhancedSpeed: 110 };
const RECORD = { lat: 0, lon: 1, altitude: 2, hr: 3, distance: 5, enhancedAltitude: 78 };
const TIMESTAMP = 253;
// Known [lat, long] field pairs per message.
const POSITION_PAIRS: Record<number, [number, number][]> = {
  20: [[RECORD.lat, RECORD.lon]],
  19: [[LAP.startLat, LAP.startLon], [LAP.endLat, LAP.endLon]],
  18: [[SESSION.startLat, SESSION.startLon], [SESSION.endLat, SESSION.endLon]]
};
// Altitude fields (scale 5, offset 500): record altitude/enhanced_altitude,
// lap and session avg/max/min (plain and enhanced).
const ALTITUDE_FIELDS: Record<number, number[]> = {
  20: [2, 78],
  19: [42, 43, 62, 112, 113, 114],
  18: [49, 50, 71, 126, 127, 128]
};
const EVENT = { event: 0, type: 1 };
const TIMER_EVENT = 0;
const TIMER_START = 0;
const TIMER_STOP = 1;
const TIMER_STOP_ALL = 4;

interface Rec {
  t: number;
  /** Distance in cm, or null. */
  d: number | null;
  pos: LatLon | null;
  alt: number | null;
  hr: number | null;
}

interface Lap {
  start: number;
  /** Elapsed time in ms. */
  elapsed: number;
  /** Distance in cm. */
  distance: number;
}

interface Survey {
  recs: Rec[];
  laps: Lap[];
  /** [stop, start) timer pauses, in FIT seconds. */
  pauses: [number, number][];
  sessionStart: number | null;
  sessionElapsedMs: number | null;
  compressed: boolean;
}

function surveyFit(bytes: Uint8Array): Survey {
  const s: Survey = { recs: [], laps: [], pauses: [], sessionStart: null, sessionElapsedMs: null, compressed: false };
  let pausedAt: number | null = null;
  rewriteFit(bytes, {
    edit(msg) {
      const t = msg.get(TIMESTAMP);
      if (msg.global === 20) {
        if (t === null) {
          s.compressed = true;
          return;
        }
        const la = msg.get(RECORD.lat);
        const lo = msg.get(RECORD.lon);
        s.recs.push({
          t,
          d: msg.get(RECORD.distance),
          pos: la !== null && lo !== null ? { lat: la / SEMI, lon: lo / SEMI } : null,
          alt: msg.get(RECORD.enhancedAltitude) ?? msg.get(RECORD.altitude),
          hr: msg.get(RECORD.hr)
        });
      } else if (msg.global === 19) {
        s.laps.push({ start: msg.get(LAP.start) ?? 0, elapsed: msg.get(LAP.elapsed) ?? 0, distance: msg.get(LAP.distance) ?? 0 });
      } else if (msg.global === 18 && s.sessionStart === null) {
        s.sessionStart = msg.get(SESSION.start);
        s.sessionElapsedMs = msg.get(SESSION.elapsed) ?? msg.get(SESSION.timer);
      } else if (msg.global === 21 && t !== null && msg.get(EVENT.event) === TIMER_EVENT) {
        const type = msg.get(EVENT.type);
        if ((type === TIMER_STOP || type === TIMER_STOP_ALL) && pausedAt === null) pausedAt = t;
        else if (type === TIMER_START && pausedAt !== null) {
          s.pauses.push([pausedAt, t]);
          pausedAt = null;
        }
      }
    }
  });
  return s;
}

/** The part of a FIT file that survives the trim, and what it takes to rewrite the rest to match. */
interface TrimPlan {
  tStart: number;
  tEnd: number;
  /** Where the session's elapsed time ran out (start + elapsed), in FIT seconds. */
  sessionEnd: number;
  /** Distance (cm) of the first and last kept record. */
  dStart: number;
  dEnd: number;
  dLast: number;
  firstPos: LatLon | null;
  lastPos: LatLon | null;
  /** Seconds of timer (not paused) time between two instants. */
  timerIn: (a: number, b: number) => number;
}

function planTrim(s: Survey, d: Disguise): TrimPlan | null {
  const withDist = s.recs.filter((r): r is Rec & { d: number } => r.d !== null);
  if (!s.recs.some((r) => r.pos) || withDist.length === 0) return null; // no route to hide
  if (s.compressed) throw new Error('Compressed-timestamp records: trimming would shift their decoded times');
  if (s.sessionStart === null || s.sessionElapsedMs === null) throw new Error('GPS file without a session');
  const d0 = withDist[0]!.d;
  const dLast = withDist[withDist.length - 1]!.d;
  const first = withDist.find((r) => r.d - d0 >= d.trimStartM * 100);
  const last = withDist.filter((r) => dLast - r.d >= d.trimEndM * 100).at(-1);
  if (!first || !last || last.d - first.d < MIN_KEPT_M * 100) throw new Error('Route too short to trim and still publish');
  const kept = s.recs.filter((r) => r.t >= first.t && r.t <= last.t);
  const positions = kept.flatMap((r) => (r.pos ? [r.pos] : []));
  const timerIn = (a: number, b: number) => {
    let paused = 0;
    for (const [ps, pe] of s.pauses) paused += Math.max(0, Math.min(b, pe) - Math.max(a, ps));
    return Math.max(0, b - a - paused);
  };
  return {
    tStart: first.t,
    tEnd: last.t,
    sessionEnd: s.sessionStart + s.sessionElapsedMs / 1000,
    dStart: first.d,
    dEnd: last.d,
    dLast,
    firstPos: positions[0] ?? null,
    lastPos: positions[positions.length - 1] ?? null,
    timerIn
  };
}

/**
 * Timer seconds spent in each HR zone between two instants, from the
 * records: each gap between records counts at the heart rate that ends it.
 * Zone z holds heart rates up to highs[z]; the last one, anything above.
 */
function zoneSecondsIn(recs: Rec[], a: number, b: number, highs: (number | null)[], timerIn: (a: number, b: number) => number): number[] {
  const out = new Array<number>(highs.length + 1).fill(0);
  for (let i = 1; i < recs.length; i++) {
    const lo = Math.max(a, recs[i - 1]!.t);
    const hi = Math.min(b, recs[i]!.t);
    const hr = recs[i]!.hr;
    if (hi <= lo || hr === null) continue;
    const z = highs.findIndex((h) => h !== null && hr <= h);
    out[z < 0 ? highs.length : z]! += timerIn(lo, hi);
  }
  return out;
}

function setPos(msg: FitMessage, latField: number, lonField: number, p: LatLon | null) {
  if (!p || msg.get(latField) === null) return;
  msg.set(latField, Math.round(p.lat * SEMI));
  msg.set(lonField, Math.round(p.lon * SEMI));
}

function scaleFields(msg: FitMessage, fields: number[], frac: number) {
  for (const f of fields) {
    const v = msg.get(f);
    if (v !== null) msg.set(f, Math.round(v * frac));
  }
}

/** Speed (m/s x 1000) from a distance in cm and a time in ms. */
function speedOf(cm: number, ms: number): number {
  return ms > 0 ? Math.round((cm * 10_000) / ms) : 0;
}

function setSpeed(msg: FitMessage, fields: number[], cm: number, ms: number) {
  for (const f of fields) if (msg.get(f) !== null) msg.set(f, Math.min(speedOf(cm, ms), f === SESSION.speed || f === LAP.speed ? 0xfffe : 0xfffffffe));
}

function isSint32(msg: FitMessage, num: number): boolean {
  const f = msg.fields.find((x) => x.num === num);
  return !!f && (f.baseType & 0x1f) === 0x05 && f.size === 4;
}

/** First record position in a FIT file, in degrees. */
export function firstFitPosition(bytes: Uint8Array): LatLon | null {
  return surveyFit(bytes).recs.find((r) => r.pos)?.pos ?? null;
}

/**
 * Anonymises a FIT file with the given disguise. `region` (any real
 * position from the same set of recordings) lets a file without GPS still
 * have stray position-like fields found and cleared. Returns the new file
 * and how many such fields were cleared.
 */
export function anonymiseFit(bytes: Uint8Array, disguise: Disguise, region: LatLon | null = null): { bytes: Uint8Array<ArrayBuffer>; cleared: number } {
  const survey = surveyFit(bytes);
  const plan = planTrim(survey, disguise);

  const keptRecs = plan ? survey.recs.filter((r) => r.t >= plan.tStart && r.t <= plan.tEnd) : survey.recs;
  const allPositions = survey.recs.flatMap((r) => (r.pos ? [r.pos] : []));
  const isPrivate = privacyZone([allPositions[0], allPositions[allPositions.length - 1]]);
  const positions = keptRecs.flatMap((r) => (r.pos && !isPrivate(r.pos) ? [r.pos] : []));
  const from = positions.length ? boxCentre(positions) : null;
  const move = from ? makeMover(from, disguise.rotateDeg, disguise.centre) : null;
  const alts = keptRecs.flatMap((r) => (r.alt !== null ? [r.alt / 5 - 500] : []));
  const altShift = alts.length ? Math.round((disguise.lowestAltM - Math.min(...alts)) * 5) : 0;
  const near = from ?? region;
  const nearRoute = (semi: number) => !!near && (Math.abs(semi / SEMI - near.lat) < NEAR_DEG || Math.abs(semi / SEMI - near.lon) < NEAR_DEG);

  // Lap plan, by position in the file: [ns, ne] is the kept part of the
  // lap's time. Laps are placed end to end from the session start by their
  // elapsed times (their start_time is whole seconds, rounded up), so the
  // kept laps still add up to the session.
  let lapIndex = 0;
  let lapCm = 0;
  let lapMs = 0;
  const lapPlans = survey.laps.map((lap) => {
    const startCm = lapCm;
    lapCm += lap.distance;
    const start = survey.sessionStart !== null ? survey.sessionStart + lapMs / 1000 : lap.start;
    lapMs += lap.elapsed;
    if (!plan) return null;
    const end = start + lap.elapsed / 1000;
    if (end <= plan.tStart || start >= plan.tEnd) return { drop: true as const };
    const ns = Math.max(start, plan.tStart);
    const ne = Math.min(end, plan.tEnd);
    const cm = Math.max(0, Math.min(startCm + lap.distance, plan.dEnd) - Math.max(startCm, plan.dStart));
    return { drop: false as const, start, ns, ne, cut: { before: ns - start, after: end - ne }, cm, frac: lap.distance > 0 ? cm / lap.distance : 1 };
  });
  // Laps are only dropped from the ends, so kept ones move down by the count dropped before them.
  const firstKeptLap = Math.max(0, lapPlans.findIndex((lp) => lp && !lp.drop));

  // A timestamp outside the kept part: clamped to it while the session ran,
  // moved back by the trimmed end when it's after (session save, recovery HR).
  const clampTime = (t: number) => {
    if (!plan) return t;
    if (t < plan.tStart) return plan.tStart;
    if (t <= plan.tEnd) return t;
    if (t <= plan.sessionEnd + 1) return plan.tEnd;
    return t - Math.round(plan.sessionEnd - plan.tEnd);
  };

  let cleared = 0;
  const out = rewriteFit(bytes, {
    keep: (g) => KEEP.has(g),
    filter(msg) {
      if (!plan) return true;
      const t = msg.get(TIMESTAMP);
      if (msg.global === 20) return t !== null && t >= plan.tStart && t <= plan.tEnd;
      if (msg.global === 19) return !lapPlans[lapIndex++]?.drop;
      if (msg.global === 216 && msg.get(ZONE.referenceMesg) === 19) return !lapPlans[msg.get(ZONE.referenceIndex) ?? -1]?.drop;
      if (msg.global === 21 && t !== null && (t < plan.tStart || (t > plan.tEnd && t <= plan.sessionEnd + 1))) {
        // Inside a trimmed part only the timer's own first start and final stop survive.
        const timer = msg.get(EVENT.event) === TIMER_EVENT;
        const type = msg.get(EVENT.type);
        return timer && ((type === TIMER_START && t <= (survey.sessionStart ?? 0)) || (type === TIMER_STOP_ALL && t > plan.tEnd));
      }
      return true;
    },
    edit(msg) {
      if (msg.global === 0) for (const n of FILE_ID_BLANK) msg.clear(n);
      if (msg.global === 34) msg.clear(ACTIVITY_LOCAL_TIMESTAMP);

      if (plan) {
        const t = msg.get(TIMESTAMP);
        if (t !== null) msg.set(TIMESTAMP, clampTime(t));
        if (msg.global === 0 && msg.get(4) !== null) msg.set(4, clampTime(msg.get(4)!)); // time_created
        if (msg.global === 20) {
          const dist = msg.get(RECORD.distance);
          if (dist !== null) msg.set(RECORD.distance, dist - plan.dStart);
        } else if (msg.global === 18) {
          const start = msg.get(SESSION.start) ?? plan.tStart;
          const cutBefore = plan.tStart - start;
          const cutAfter = plan.sessionEnd - plan.tEnd;
          const elapsed = msg.get(SESSION.elapsed);
          const timer = msg.get(SESSION.timer);
          const dist = msg.get(SESSION.distance);
          const newTimer = timer !== null ? Math.max(0, Math.round(timer - (plan.timerIn(start, plan.tStart) + plan.timerIn(plan.tEnd, plan.sessionEnd)) * 1000)) : null;
          const newDist = dist !== null ? Math.max(0, dist - plan.dStart - (plan.dLast - plan.dEnd)) : null;
          msg.set(SESSION.start, plan.tStart);
          if (elapsed !== null) msg.set(SESSION.elapsed, Math.max(0, Math.round(elapsed - (cutBefore + cutAfter) * 1000)));
          if (newTimer !== null) msg.set(SESSION.timer, newTimer);
          if (newDist !== null) msg.set(SESSION.distance, newDist);
          if (newDist !== null && newTimer !== null) setSpeed(msg, [SESSION.speed, SESSION.enhancedSpeed], newDist, newTimer);
          if (dist) scaleFields(msg, [SESSION.ascent, SESSION.descent], (newDist ?? dist) / dist);
          if (timer) scaleFields(msg, [SESSION.calories], (newTimer ?? timer) / timer);
          setPos(msg, SESSION.startLat, SESSION.startLon, plan.firstPos);
          setPos(msg, SESSION.endLat, SESSION.endLon, plan.lastPos);
        } else if (msg.global === 19) {
          const lp = lapPlans[lapIndex - 1];
          if (lp && !lp.drop) {
            const elapsed = msg.get(LAP.elapsed);
            const timer = msg.get(LAP.timer);
            const newTimer = timer !== null ? Math.max(0, Math.round(timer - (plan.timerIn(lp.start, lp.ns) + plan.timerIn(lp.ne, lp.ne + lp.cut.after)) * 1000)) : null;
            if (lp.cut.before > 0) msg.set(LAP.start, plan.tStart);
            if (elapsed !== null) msg.set(LAP.elapsed, Math.max(0, Math.round(elapsed - (lp.cut.before + lp.cut.after) * 1000)));
            if (newTimer !== null) msg.set(LAP.timer, newTimer);
            if (msg.get(LAP.distance) !== null) msg.set(LAP.distance, lp.cm);
            if (newTimer !== null) setSpeed(msg, [LAP.speed, LAP.enhancedSpeed], lp.cm, newTimer);
            scaleFields(msg, [LAP.ascent, LAP.descent], lp.frac);
            if (timer) scaleFields(msg, [LAP.calories], (newTimer ?? timer) / timer);
            if (lp.cut.before > 0) setPos(msg, LAP.startLat, LAP.startLon, plan.firstPos);
            if (lp.cut.after > 0) setPos(msg, LAP.endLat, LAP.endLon, plan.lastPos);
          }
        } else if (msg.global === 216) {
          // Take the trimmed time out of the HR zones of the session and of the laps that were cut.
          let cuts: [number, number][] = [];
          if (msg.get(ZONE.referenceMesg) === 18) cuts = [[survey.sessionStart ?? plan.tStart, plan.tStart], [plan.tEnd, plan.sessionEnd]];
          else if (msg.get(ZONE.referenceMesg) === 19) {
            const ref = msg.get(ZONE.referenceIndex);
            const lp = ref !== null ? lapPlans[ref] : null;
            if (lp && !lp.drop) cuts = [[lp.start, lp.ns], [lp.ne, lp.ne + lp.cut.after]];
            if (ref !== null) msg.set(ZONE.referenceIndex, ref - firstKeptLap);
          }
          const times = msg.getArray(ZONE.hrTime);
          const highs = msg.getArray(ZONE.hrHigh);
          if (cuts.length && times && highs) {
            const cut = cuts.map(([a, b]) => zoneSecondsIn(survey.recs, a, b, highs, plan.timerIn));
            msg.setArray(ZONE.hrTime, times.map((v, z) => (v === null ? null : Math.max(0, Math.round(v - cut.reduce((s, c) => s + (c[z] ?? 0), 0) * 1000)))));
          }
        } else if (msg.global === 34) {
          const timer = msg.get(0); // activity.total_timer_time
          if (timer !== null) msg.set(0, Math.max(0, Math.round(timer - (plan.timerIn(survey.sessionStart ?? plan.tStart, plan.tStart) + plan.timerIn(plan.tEnd, plan.sessionEnd)) * 1000)));
        }
      }

      if (altShift) {
        for (const f of ALTITUDE_FIELDS[msg.global] ?? []) {
          const v = msg.get(f);
          if (v !== null) msg.set(f, v + altShift);
        }
      }

      const handled = new Set<number>();
      for (const [la, lo] of POSITION_PAIRS[msg.global] ?? []) {
        handled.add(la).add(lo);
        const lat = msg.get(la);
        const lon = msg.get(lo);
        if (lat === null || lon === null) continue;
        const real = { lat: lat / SEMI, lon: lon / SEMI };
        // No mover means every position was private: none may stay as it is.
        if (!move || isPrivate(real)) {
          msg.clear(la);
          msg.clear(lo);
          continue;
        }
        const p = move(real);
        msg.set(la, Math.round(p.lat * SEMI));
        msg.set(lo, Math.round(p.lon * SEMI));
      }
      for (const f of msg.fields) {
        if (handled.has(f.num) || !isSint32(msg, f.num)) continue;
        const v = msg.get(f.num);
        if (v !== null && Math.abs(v) > 1_000_000 && nearRoute(v)) {
          msg.clear(f.num);
          cleared++;
        }
      }
    }
  });
  assertNearCentre(fitPositions(out), disguise);
  return { bytes: out, cleared };
}

/** Every known position in a FIT file, in degrees. */
function fitPositions(bytes: Uint8Array): LatLon[] {
  const out: LatLon[] = [];
  rewriteFit(bytes, {
    edit(msg) {
      for (const [la, lo] of POSITION_PAIRS[msg.global] ?? []) {
        const lat = msg.get(la);
        const lon = msg.get(lo);
        if (lat !== null && lon !== null) out.push({ lat: lat / SEMI, lon: lon / SEMI });
      }
    }
  });
  return out;
}

const MAX_FROM_CENTRE_M = 50_000;

/** Last line of defence: a position that wasn't moved (a real one) would be far from the disguise's centre. */
function assertNearCentre(points: LatLon[], disguise: Disguise) {
  const stray = points.find((p) => metresBetween(p, disguise.centre) > MAX_FROM_CENTRE_M);
  if (stray) throw new Error("A position wasn't anonymised - refusing to write it");
}

// ----- GPX -----

const TRKPT = /(\s*)<trkpt\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"[\s\S]*?<\/trkpt>/g;

export function anonymiseGpx(text: string, disguise: Disguise): string {
  // Trim by distance along the track, and drop what's left near the real start and finish.
  const pts = [...text.matchAll(TRKPT)].map((m) => ({ lat: Number(m[2]), lon: Number(m[3]) }));
  if (pts.length === 0) throw new Error('GPX without track points');
  const isPrivate = privacyZone([pts[0], pts[pts.length - 1]]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + metresBetween(pts[i - 1]!, pts[i]!));
  const total = cum[cum.length - 1]!;
  const first = cum.findIndex((c) => c >= disguise.trimStartM);
  const last = cum.reduce((found, c, i) => (total - c >= disguise.trimEndM ? i : found), -1);
  if (first < 0 || last < 0 || cum[last]! - cum[first]! < MIN_KEPT_M) throw new Error('Route too short to trim and still publish');
  let k = 0;
  let out = text.replace(TRKPT, (m) => {
    const keep = k >= first && k <= last && !isPrivate(pts[k]!);
    k++;
    return keep ? m : '';
  });

  // The file's own timestamp is the first kept point's.
  const firstTime = /<trkpt\b[\s\S]*?<time>([^<]+)<\/time>/.exec(out)?.[1];
  if (firstTime) out = out.replace(/(<metadata>[\s\S]*?<time>)[^<]+(<\/time>)/, `$1${firstTime}$2`);

  const kept = pts.slice(first, last + 1).filter((p) => !isPrivate(p));
  if (kept.length < 2) throw new Error('Nothing left of the route outside the privacy zone');
  const move = makeMover(boxCentre(kept), disguise.rotateDeg, disguise.centre);
  const eles = [...out.matchAll(/<ele>([-\d.]+)<\/ele>/g)].map((m) => Number(m[1]));
  const eleShift = eles.length ? disguise.lowestAltM - Math.min(...eles) : 0;
  const result = out
    .replace(/(<gpx\b[^>]*\screator=")[^"]*"/, '$1Lapline test fixture"')
    .replace(/<(trkpt|rtept|wpt)(\s+)lat="([-\d.]+)"(\s+)lon="([-\d.]+)"/g, (_m, tag, s1, lat, s2, lon) => {
      const p = move({ lat: Number(lat), lon: Number(lon) });
      return `<${tag}${s1}lat="${p.lat.toFixed(7)}"${s2}lon="${p.lon.toFixed(7)}"`;
    })
    .replace(/<ele>([-\d.]+)<\/ele>/g, (_m, v) => `<ele>${(Number(v) + eleShift).toFixed(1)}</ele>`);
  assertNearCentre(
    [...result.matchAll(/<(?:trkpt|rtept|wpt)\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"/g)].map((m) => ({ lat: Number(m[1]), lon: Number(m[2]) })),
    disguise
  );
  return result;
}

/** Moves every <time> in a GPX file by whole days, keeping its format. */
export function shiftGpxDays(text: string, days: number): string {
  return text.replace(/<time>([^<]+)<\/time>/g, (_m, iso: string) => {
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) throw new Error(`Unreadable GPX time ${iso}`);
    const shifted = new Date(t.getTime() + days * 86_400_000).toISOString();
    return `<time>${iso.includes('.') ? shifted : shifted.replace(/\.\d{3}Z$/, 'Z')}</time>`;
  });
}

/** First <time> in a GPX file. */
export function firstGpxTime(text: string): string | null {
  return /<time>([^<]+)<\/time>/.exec(text)?.[1] ?? null;
}
