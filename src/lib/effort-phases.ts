// lib/effort-phases.ts
// Segments an activity's real HR/pace streams into up to four narrative
// phases for the Tape view's effort-tape caption strip: warm-up drift,
// steady state, cardiac drift onset, and a closing surge. No device field
// carries this - it's derived here from the same per-second streams every
// other chart on this page already uses. A first-pass heuristic (see
// bug-list.md): each boundary is a real, deterministic test against the
// activity's own data, not a guess, but the thresholds below haven't been
// tuned against more than one real stub activity.

export type EffortPhaseKind = 'warmup' | 'steady' | 'drift' | 'surge';

export interface EffortPhase {
  kind: EffortPhaseKind;
  startSec: number;
  endSec: number;
  avgHR: number;
  avgPaceMinPerKm: number;
  maxHR?: number; // surge only
  deltaHR?: number; // drift only - second-half avg HR minus first-half avg HR
  paceTrend?: 'flat' | 'quickening' | 'fading'; // drift only
  paceStdDevSec?: number; // steady only - spread of per-km pace within the phase, seconds
  distanceKm?: number; // steady only
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

// ~1Hz per-second streams throughout this app, so a plain index window
// approximates a time window closely enough for this purpose.
function rollingMean(values: number[], windowSize: number): number[] {
  const n = values.length;
  const half = Math.floor(windowSize / 2);
  const out = new Array<number>(n);
  let sum = 0;
  let count = 0;
  // Sliding sum: grow the window as i advances, dropping samples that fall
  // outside [i-half, i+half] - O(n) instead of O(n*window).
  let lo = 0;
  let hi = -1;
  for (let i = 0; i < n; i++) {
    const wantLo = Math.max(0, i - half);
    const wantHi = Math.min(n - 1, i + half);
    while (lo < wantLo) {
      sum -= values[lo]!;
      count--;
      lo++;
    }
    while (hi < wantHi) {
      hi++;
      sum += values[hi]!;
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

function phaseAvgHR(hr: number[], startIdx: number, endIdx: number): number {
  const slice = hr.slice(startIdx, endIdx + 1).filter((v) => v > 0);
  return mean(slice);
}

function phaseAvgPace(pace: number[], startIdx: number, endIdx: number): number {
  return mean(pace.slice(startIdx, endIdx + 1));
}

function phaseMaxHR(hr: number[], startIdx: number, endIdx: number): number {
  const slice = hr.slice(startIdx, endIdx + 1);
  return slice.length > 0 ? Math.max(...slice) : 0;
}

// Splits [startIdx, endIdx] into ~1km chunks (by real cumulative distance)
// and returns each chunk's own average pace, for measuring how steady the
// steady-state phase really was - a raw per-second pace stddev would mostly
// measure GPS/footstrike noise, not pacing consistency.
function perKmPaces(distance: number[], pace: number[], startIdx: number, endIdx: number): number[] {
  const startDist = distance[startIdx] ?? 0;
  const chunks: number[][] = [];
  let chunkStart = startIdx;
  let nextBoundary = startDist + 1000;
  for (let i = startIdx; i <= endIdx; i++) {
    if ((distance[i] ?? 0) >= nextBoundary) {
      chunks.push(pace.slice(chunkStart, i + 1));
      chunkStart = i + 1;
      nextBoundary += 1000;
    }
  }
  if (chunkStart <= endIdx) chunks.push(pace.slice(chunkStart, endIdx + 1));
  return chunks.filter((c) => c.length > 0).map((c) => mean(c));
}

const WARMUP_SUSTAIN_SEC = 60;
const WARMUP_MAX_FRACTION = 0.25;
const SURGE_MIN_SEC = 60;
const SURGE_THRESHOLD = 0.93; // trailing pace must be at least 7% faster (lower min/km) than the session mean
const DRIFT_MIN_HR_DELTA = 3; // bpm, second half vs first half of the middle window
const DRIFT_PACE_FLAT_FRACTION = 0.03;
const MIN_MIDDLE_SEC_FOR_SPLIT = 120;
const MIN_DURATION_SEC = 600; // below this, phase segmentation isn't meaningful

export function segmentEffortPhases(t: number[], hr: number[], pace: number[], distance: number[], hrZoneBoundaries: number[]): EffortPhase[] {
  const n = Math.min(t.length, hr.length, pace.length, distance.length);
  if (n < 2) return [];
  const durationSec = t[n - 1]! - t[0]!;
  if (durationSec < MIN_DURATION_SEC) return [];

  const smoothHr = rollingMean(hr.slice(0, n), 31);
  const smoothPace = rollingMean(pace.slice(0, n), 31);
  const meanPaceAll = mean(pace.slice(0, n));
  const meanHrAllFallback = mean(hr.slice(0, n).filter((v) => v > 0)) * 0.9;
  const aerobicFloor = hrZoneBoundaries.length === 5 ? hrZoneBoundaries[2]! : meanHrAllFallback;

  // Warm-up: ends once smoothed HR reaches the aerobic zone floor and stays
  // there for a sustained window (avoids tripping on one noisy spike).
  let warmupEndIdx = -1;
  for (let i = 0; i < n; i++) {
    if (smoothHr[i]! >= aerobicFloor) {
      const checkEnd = Math.min(n - 1, i + WARMUP_SUSTAIN_SEC);
      let sustained = true;
      for (let j = i; j <= checkEnd; j++) {
        if (smoothHr[j]! < aerobicFloor) {
          sustained = false;
          break;
        }
      }
      if (sustained) {
        warmupEndIdx = i;
        break;
      }
    }
  }
  if (warmupEndIdx > n * WARMUP_MAX_FRACTION) warmupEndIdx = -1;

  // Closing surge: scan back from the end while the smoothed pace stays
  // measurably faster than the session average; the surge starts right
  // after the last sample that wasn't.
  let surgeStartIdx = -1;
  {
    let idx = n - 1;
    while (idx > 0 && smoothPace[idx]! <= meanPaceAll * SURGE_THRESHOLD) idx--;
    const candidate = idx + 1;
    if (candidate < n - 1 && t[n - 1]! - t[candidate]! >= SURGE_MIN_SEC) surgeStartIdx = candidate;
  }
  if (surgeStartIdx !== -1 && warmupEndIdx !== -1 && surgeStartIdx <= warmupEndIdx) surgeStartIdx = -1;

  const middleStart = warmupEndIdx !== -1 ? warmupEndIdx : 0;
  const middleEnd = surgeStartIdx !== -1 ? surgeStartIdx - 1 : n - 1;

  const phases: EffortPhase[] = [];

  if (warmupEndIdx !== -1) {
    phases.push({
      kind: 'warmup',
      startSec: t[0]!,
      endSec: t[warmupEndIdx]!,
      avgHR: phaseAvgHR(hr, 0, warmupEndIdx),
      avgPaceMinPerKm: phaseAvgPace(pace, 0, warmupEndIdx)
    });
  }

  if (middleEnd > middleStart) {
    const middleDurationSec = t[middleEnd]! - t[middleStart]!;
    let splitIdx = -1;
    if (middleDurationSec >= MIN_MIDDLE_SEC_FOR_SPLIT) {
      const mid = middleStart + Math.floor((middleEnd - middleStart) / 2);
      const firstHalfHr = phaseAvgHR(hr, middleStart, mid);
      const secondHalfHr = phaseAvgHR(hr, mid + 1, middleEnd);
      if (secondHalfHr - firstHalfHr >= DRIFT_MIN_HR_DELTA) splitIdx = mid;
    }

    if (splitIdx !== -1) {
      const steadyPaces = perKmPaces(distance, pace, middleStart, splitIdx);
      phases.push({
        kind: 'steady',
        startSec: t[middleStart]!,
        endSec: t[splitIdx]!,
        avgHR: phaseAvgHR(hr, middleStart, splitIdx),
        avgPaceMinPerKm: phaseAvgPace(pace, middleStart, splitIdx),
        distanceKm: ((distance[splitIdx] ?? 0) - (distance[middleStart] ?? 0)) / 1000,
        paceStdDevSec: steadyPaces.length >= 2 ? stdDev(steadyPaces) * 60 : undefined
      });

      const firstHalfPace = phaseAvgPace(pace, middleStart, splitIdx);
      const secondHalfPace = phaseAvgPace(pace, splitIdx + 1, middleEnd);
      const paceDeltaFrac = firstHalfPace > 0 ? (secondHalfPace - firstHalfPace) / firstHalfPace : 0;
      const paceTrend = paceDeltaFrac < -DRIFT_PACE_FLAT_FRACTION ? 'quickening' : paceDeltaFrac > DRIFT_PACE_FLAT_FRACTION ? 'fading' : 'flat';
      phases.push({
        kind: 'drift',
        startSec: t[splitIdx + 1]!,
        endSec: t[middleEnd]!,
        avgHR: phaseAvgHR(hr, splitIdx + 1, middleEnd),
        avgPaceMinPerKm: secondHalfPace,
        deltaHR: phaseAvgHR(hr, splitIdx + 1, middleEnd) - phaseAvgHR(hr, middleStart, splitIdx),
        paceTrend
      });
    } else {
      const steadyPaces = perKmPaces(distance, pace, middleStart, middleEnd);
      phases.push({
        kind: 'steady',
        startSec: t[middleStart]!,
        endSec: t[middleEnd]!,
        avgHR: phaseAvgHR(hr, middleStart, middleEnd),
        avgPaceMinPerKm: phaseAvgPace(pace, middleStart, middleEnd),
        distanceKm: ((distance[middleEnd] ?? 0) - (distance[middleStart] ?? 0)) / 1000,
        paceStdDevSec: steadyPaces.length >= 2 ? stdDev(steadyPaces) * 60 : undefined
      });
    }
  }

  if (surgeStartIdx !== -1) {
    phases.push({
      kind: 'surge',
      startSec: t[surgeStartIdx]!,
      endSec: t[n - 1]!,
      avgHR: phaseAvgHR(hr, surgeStartIdx, n - 1),
      avgPaceMinPerKm: phaseAvgPace(pace, surgeStartIdx, n - 1),
      maxHR: phaseMaxHR(hr, surgeStartIdx, n - 1)
    });
  }

  return phases;
}

export const EFFORT_PHASE_LABELS: Record<EffortPhaseKind, string> = {
  warmup: 'Warm-up drift',
  steady: 'Steady state',
  drift: 'Cardiac drift onset',
  surge: 'Closing surge'
};
