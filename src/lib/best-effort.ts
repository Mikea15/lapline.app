// lib/best-effort.ts
// Generic sliding-window "best effort" search over a monotonic cumulative
// stream (distance[] vs t[], both non-decreasing) - the same primitive
// backs both the Records screen (best pace over 1/5/10km, best distance in
// 60 min) and the Critical Pace Curve (best pace over 1/5/10/20/30/45/60
// min). Both directions are two-pointer/O(n): the target threshold grows
// monotonically with the outer index, so the inner pointer never needs to
// rewind. kmSplitPaces below is a related but simpler primitive over the
// same kind of stream: fixed-width consecutive splits rather than a sliding
// best-of search.
//
// Every search takes an optional `maxSpeedMps` (see maxPlausibleSpeedMps)
// and first runs the stream through plausibleDistance, so a GPS glitch
// can't hand out a record. Without it the stream is used as recorded.

import { sportFamily, type SportFamily } from './sport-color';

// Faster than this between two samples is a glitch, not the athlete: well
// above any sprint (running) or descent (cycling), so clean data never
// trips it. Other sports keep their streams as recorded (pool swims, for
// one, can step their distance by a whole length at once).
const MAX_SPEED_MPS: Partial<Record<SportFamily, number>> = {
  running: 12,
  cycling: 30
};

export function maxPlausibleSpeedMps(sport: string): number {
  return MAX_SPEED_MPS[sportFamily(sport)] ?? Infinity;
}

// Plausible samples on each side of a glitch whose median speed stands in for it.
const GLITCH_NEIGHBOURS = 10;

// Real recordings carry distance glitches: a watch's cumulative distance
// can jump tens of metres in a second (sample-run-steady's watch logged
// 55 m in 1 s and 83 m in 6 s on a ~3 m/s run, while its own speed field
// and GPS track show no such surge), and with those inside a 1 km window
// the run's fastest km read 3:44 against a 5:27 average. Each increment
// faster than `maxSpeedMps` is replaced by the median speed of the
// plausible samples around it over the same time, and the rest of the
// stream shifted down to match. Clamping to the limit instead would still
// credit up to 12 m/s for every glitched second (3:44 only became 4:04;
// this gives 4:17). Slower over-counts (that run also gains ~7 m/s for
// ~20 s) can't be told from a sprint sample by sample, so they stay.
// Returns `distance` itself when nothing is implausible, so clean streams
// cost one pass and no copy.
export function plausibleDistance(distance: number[], t: number[], maxSpeedMps: number): number[] {
  const n = Math.min(distance.length, t.length);
  if (!(maxSpeedMps < Infinity)) return distance;
  const implausible = (k: number) => distance[k]! - distance[k - 1]! > maxSpeedMps * (t[k]! - t[k - 1]!);
  let k = 1;
  while (k < n && !implausible(k)) k++;
  if (k >= n) return distance;

  const out = distance.slice(0, n);
  const speeds: number[] = [];
  let removed = 0; // metres taken out so far
  for (; k < n; k++) {
    if (implausible(k)) {
      speeds.length = 0;
      for (let a = k - 1; a >= 1 && speeds.length < GLITCH_NEIGHBOURS; a--) {
        if (t[a]! > t[a - 1]! && !implausible(a)) speeds.push((distance[a]! - distance[a - 1]!) / (t[a]! - t[a - 1]!));
      }
      const before = speeds.length;
      for (let a = k + 1; a < n && speeds.length < before + GLITCH_NEIGHBOURS; a++) {
        if (t[a]! > t[a - 1]! && !implausible(a)) speeds.push((distance[a]! - distance[a - 1]!) / (t[a]! - t[a - 1]!));
      }
      speeds.sort((x, y) => x - y);
      const speed = speeds.length ? speeds[speeds.length >> 1]! : maxSpeedMps;
      removed += distance[k]! - distance[k - 1]! - speed * (t[k]! - t[k - 1]!);
    }
    out[k] = distance[k]! - removed;
  }
  return out;
}

// Fastest time (seconds) to cover `targetM` metres starting from any sample
// in the stream, linearly interpolating between samples for sub-sample
// precision. Returns null if the activity never covers that distance.
export function bestTimeForDistance(distance: number[], t: number[], targetM: number, maxSpeedMps = Infinity): number | null {
  distance = plausibleDistance(distance, t, maxSpeedMps);
  const n = Math.min(distance.length, t.length);
  if (n < 2) return null;
  let best: number | null = null;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const targetDist = distance[i]! + targetM;
    if (j < i) j = i;
    while (j < n - 1 && distance[j]! < targetDist) j++;
    if (distance[j]! < targetDist) break; // unreachable from here or any later start
    let crossTime: number;
    if (j === i || distance[j]! === targetDist) {
      crossTime = t[j]!;
    } else {
      const d0 = distance[j - 1]!;
      const d1 = distance[j]!;
      const frac = d1 > d0 ? (targetDist - d0) / (d1 - d0) : 0;
      crossTime = t[j - 1]! + frac * (t[j]! - t[j - 1]!);
    }
    const elapsed = crossTime - t[i]!;
    if (elapsed > 0 && (best === null || elapsed < best)) best = elapsed;
  }
  return best;
}

// Farthest distance (metres) covered in any `durationSec`-long window,
// interpolated the same way. Returns null if the activity is shorter than
// the requested duration.
export function bestDistanceForDuration(distance: number[], t: number[], durationSec: number, maxSpeedMps = Infinity): number | null {
  distance = plausibleDistance(distance, t, maxSpeedMps);
  const n = Math.min(distance.length, t.length);
  if (n < 2) return null;
  let best: number | null = null;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const targetTime = t[i]! + durationSec;
    if (j < i) j = i;
    while (j < n - 1 && t[j]! < targetTime) j++;
    if (t[j]! < targetTime) break;
    let crossDist: number;
    if (j === i || t[j]! === targetTime) {
      crossDist = distance[j]!;
    } else {
      const t0 = t[j - 1]!;
      const t1 = t[j]!;
      const frac = t1 > t0 ? (targetTime - t0) / (t1 - t0) : 0;
      crossDist = distance[j - 1]! + frac * (distance[j]! - distance[j - 1]!);
    }
    const covered = crossDist - distance[i]!;
    if (best === null || covered > best) best = covered;
  }
  return best;
}

// Consecutive, non-overlapping `segmentM`-wide splits along the stream
// (default 1km), each split's pace found by interpolating the crossing time
// at its boundaries the same way bestTimeForDistance does. Used for the
// Trends pace histogram in place of the activity's recorded laps: laps vary
// with whatever auto-lap distance (or manual presses) the device happened to
// use - some devices don't lap at all - so aggregating across many
// activities gave a sparse, inconsistent sample. Resampling every activity
// into real, fixed-distance splits gives one data point per km actually
// run, regardless of device lap settings.
export function kmSplitPaces(distance: number[], t: number[], segmentM = 1000, maxSpeedMps = Infinity): number[] {
  distance = plausibleDistance(distance, t, maxSpeedMps);
  const n = Math.min(distance.length, t.length);
  if (n < 2) return [];
  const totalDist = distance[n - 1]!;
  const numSegments = Math.floor(totalDist / segmentM);
  if (numSegments < 1) return [];

  const segmentKm = segmentM / 1000;
  const paces: number[] = [];
  let j = 0;
  let prevTime = t[0]!;
  for (let k = 1; k <= numSegments; k++) {
    const target = k * segmentM;
    while (j < n - 1 && distance[j + 1]! < target) j++;
    const time = distance[j]! >= target ? t[j]! : t[j]! + ((target - distance[j]!) / (distance[j + 1]! - distance[j]!)) * (t[j + 1]! - t[j]!);
    const paceMinPerKm = (time - prevTime) / 60 / segmentKm;
    if (paceMinPerKm > 0) paces.push(paceMinPerKm);
    prevTime = time;
  }
  return paces;
}

// Fastest sustained pace (min/km) over any `windowM` stretch (default 1 km,
// the same window Records uses) from the per-second distance stream. Returns
// null when there's no usable distance stream or the activity is shorter than
// the window, so callers can fall back to the device's laps.
export function bestWindowPace(distance: number[], t: number[], windowM = 1000, maxSpeedMps = Infinity): number | null {
  const sec = bestTimeForDistance(distance, t, windowM, maxSpeedMps);
  return sec !== null && sec > 0 ? sec / 60 / (windowM / 1000) : null;
}
