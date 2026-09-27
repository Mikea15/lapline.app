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

// Fastest time (seconds) to cover `targetM` metres starting from any sample
// in the stream, linearly interpolating between samples for sub-sample
// precision. Returns null if the activity never covers that distance.
export function bestTimeForDistance(distance: number[], t: number[], targetM: number): number | null {
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
export function bestDistanceForDuration(distance: number[], t: number[], durationSec: number): number | null {
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
export function kmSplitPaces(distance: number[], t: number[], segmentM = 1000): number[] {
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
