// lib/lap-detail.ts
// Per-lap slices of the activity's real per-second streams, for the Tape
// view's "kilometre by kilometre" tile grid (bug-list.md) - each tile needs
// its own real HR trace and its own real HR-zone time mix, not just the
// lap-level averages `Lap` already carries.

import { zoneIndexForHr } from './hr-zones';
import type { Lap } from './types';

// [startIdx, endIdx) into the per-second streams covering this lap's real
// elapsed window - t is monotonic seconds-since-start, same indexing as
// hr/distance/etc throughout this app.
export function lapIndexRange(lap: Lap, t: number[]): [number, number] {
  const startSec = lap.startOffsetSec;
  const endSec = lap.startOffsetSec + lap.elapsedSec;
  let startIdx = t.findIndex((v) => v >= startSec);
  if (startIdx === -1) return [t.length, t.length];
  let endIdx = t.length;
  for (let i = startIdx; i < t.length; i++) {
    if (t[i]! >= endSec) {
      endIdx = i;
      break;
    }
  }
  return [startIdx, endIdx];
}

export function lapHrTrace(lap: Lap, t: number[], hr: number[]): number[] {
  const [s, e] = lapIndexRange(lap, t);
  return hr.slice(s, e).filter((v) => v > 0);
}

// [z1..z5] fraction (0..1, summing to 1) of this lap's real HR samples
// spent in each zone. Samples with no reading (<=0) or below every
// configured zone floor (-1) are excluded from the denominator rather than
// counted as an undefined 6th bucket. [] if there's no usable HR data or no
// zone config, so the caller can skip drawing a mix bar rather than drawing
// an empty/misleading one.
export function lapZoneMix(lap: Lap, t: number[], hr: number[], hrZoneBoundaries: number[]): number[] {
  if (hrZoneBoundaries.length !== 5) return [];
  const [s, e] = lapIndexRange(lap, t);
  const counts = [0, 0, 0, 0, 0];
  let total = 0;
  for (let i = s; i < e; i++) {
    const hrVal = hr[i] ?? 0;
    if (hrVal <= 0) continue;
    const z = zoneIndexForHr(hrVal, hrZoneBoundaries);
    if (z >= 0) {
      counts[z]! += 1;
      total += 1;
    }
  }
  return total > 0 ? counts.map((c) => c / total) : [];
}
