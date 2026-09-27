// lib/hr-density.ts
// Heart-rate density histogram for the Atlas stats sheet
// (design_handoff_atlas/README.md section 5c): how much of the activity was
// spent at each bpm, bucketed across the activity's own real HR range, each
// bar scaled against the modal (most common) bin so the busiest bpm range
// always reads as a full-width bar.
//
// The range used to be a fixed 110-185 bpm, which lumped every sample of a
// low-HR session (e.g. bouldering at 55-98 bpm) into the single bottom bin
// (bug-list.md). It now follows the activity: its 1st-99th percentile HR
// (so one sensor spike can't stretch the axis), snapped outward to whole
// bin widths, with the rare readings beyond that clamped into the edge bins.

import { zoneIndexForHr } from './hr-zones';

export interface HrDensityBin {
  bpmLo: number;
  bpmHi: number;
  count: number;
  widthFrac: number; // 0..1, this bin's count relative to the modal bin's
  zone: number; // -1..4, the zone this bin's midpoint falls in
}

const DEFAULT_LO = 110; // range used when there's no HR data at all
const DEFAULT_HI = 185;
const MAX_BINS = 18;
const BIN_WIDTHS = [5, 10, 15, 20]; // bpm - the narrowest that fits within MAX_BINS wins

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx]!;
}

/** The bpm axis for a histogram of `valid` (>0) readings: [lo, hi) split
 *  into `bins` bins of `width` bpm, snapped to multiples of the width. */
export function hrDensityRange(valid: number[]): { lo: number; width: number; bins: number } {
  if (valid.length === 0) return { lo: DEFAULT_LO, width: (DEFAULT_HI - DEFAULT_LO) / 14, bins: 14 };
  const sorted = valid.slice().sort((a, b) => a - b);
  const pLo = percentile(sorted, 0.01);
  const pHi = percentile(sorted, 0.99);
  for (const width of BIN_WIDTHS) {
    const lo = Math.floor(pLo / width) * width;
    const hi = Math.max(lo + width, Math.ceil((pHi + 1e-9) / width) * width);
    const bins = Math.round((hi - lo) / width);
    if (bins <= MAX_BINS) return { lo, width, bins };
  }
  const width = BIN_WIDTHS[BIN_WIDTHS.length - 1]!;
  const lo = Math.floor(pLo / width) * width;
  return { lo, width, bins: MAX_BINS };
}

export function buildHrDensityBins(hr: number[], hrZoneBoundaries: number[]): HrDensityBin[] {
  const valid = hr.filter((v) => v > 0);
  const { lo, width, bins } = hrDensityRange(valid);
  const hi = lo + width * bins;
  const counts = new Array<number>(bins).fill(0);

  for (const v of valid) {
    const clamped = Math.max(lo, Math.min(hi - 1e-6, v));
    const idx = Math.min(bins - 1, Math.floor((clamped - lo) / width));
    counts[idx]! += 1;
  }

  const modalCount = Math.max(...counts, 1);

  return counts.map((count, i) => {
    const bpmLo = lo + i * width;
    const bpmHi = bpmLo + width;
    return {
      bpmLo,
      bpmHi,
      count,
      widthFrac: count / modalCount,
      zone: zoneIndexForHr((bpmLo + bpmHi) / 2, hrZoneBoundaries)
    };
  });
}
