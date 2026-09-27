// lib/swim-length-detail.ts
// Per-length slices of the activity's real per-second streams, plus real
// swim-specific rate math (pace/100m, SWOLF), for the Tape view's "length by
// length" tile grid (bug-list.md) - the pool-swim equivalent of
// lib/lap-detail.ts's per-lap helpers, kept as its own small file rather
// than generalizing that one (same "separate small file over a shared risk"
// call already made for PoolRouteMap sitting alongside RouteMap).

import { zoneIndexForHr } from './hr-zones';
import type { SwimLength } from './types';

// [startIdx, endIdx) into the per-second streams covering this length's
// real elapsed window - same convention as lib/lap-detail.ts's lapIndexRange.
export function lengthIndexRange(length: SwimLength, t: number[]): [number, number] {
  const startSec = length.startOffsetSec;
  const endSec = length.startOffsetSec + length.elapsedSec;
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

export function lengthHrTrace(length: SwimLength, t: number[], hr: number[]): number[] {
  const [s, e] = lengthIndexRange(length, t);
  return hr.slice(s, e).filter((v) => v > 0);
}

// [z1..z5] fraction (0..1, summing to 1) of this length's real HR samples
// spent in each zone - same contract as lib/lap-detail.ts's lapZoneMix.
export function lengthZoneMix(length: SwimLength, t: number[], hr: number[], hrZoneBoundaries: number[]): number[] {
  if (hrZoneBoundaries.length !== 5) return [];
  const [s, e] = lengthIndexRange(length, t);
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

// Real pace, normalised to seconds/100m - the same denomination as
// ActivityLedger's rate column and lib/activity-rate.ts's swim rateSortValue,
// computed here per length instead of over the whole activity. null for a
// rest length or one with no real elapsed time.
export function lengthPaceSecPer100(length: SwimLength, poolLengthM: number): number | null {
  if (!length.active || poolLengthM <= 0 || length.elapsedSec <= 0) return null;
  return (length.elapsedSec / poolLengthM) * 100;
}

// SWOLF (seconds + strokes for the length) - a standard swim efficiency
// score, lower is better, only meaningful within one session since it isn't
// normalised for pool length. Same formula as SwimSplitsTable.svelte's own
// (now superseded) implementation.
export function lengthSwolf(length: SwimLength): number | null {
  if (!length.active || length.elapsedSec <= 0 || length.strokeCount <= 0) return null;
  return Math.round(length.elapsedSec) + length.strokeCount;
}

export interface ActiveLengthRow {
  kind: 'active';
  key: string;
  length: SwimLength;
}
export interface RestLengthRow {
  kind: 'rest';
  key: string;
  firstIndex: number;
  lastIndex: number;
  elapsedSec: number;
}
export type LengthDisplayRow = ActiveLengthRow | RestLengthRow;

// Groups the real per-length sequence into display rows, merging
// consecutive rest lengths into one row spanning their combined time - the
// FIT file often splits one real pause into several short `length`
// messages, so a naive one-row-per-length grid would show a run of
// near-identical "Rest" tiles instead of a single one. Ported from
// SwimSplitsTable.svelte's own (now superseded) row-building logic.
export function buildLengthDisplayRows(lengths: SwimLength[]): LengthDisplayRow[] {
  const rows: LengthDisplayRow[] = [];
  for (const l of lengths) {
    if (l.active) {
      rows.push({ kind: 'active', key: `a${l.index}`, length: l });
      continue;
    }
    const last = rows[rows.length - 1];
    if (last && last.kind === 'rest') {
      last.lastIndex = l.index;
      last.elapsedSec += l.elapsedSec;
    } else {
      rows.push({ kind: 'rest', key: `r${l.index}`, firstIndex: l.index, lastIndex: l.index, elapsedSec: l.elapsedSec });
    }
  }
  return rows;
}
