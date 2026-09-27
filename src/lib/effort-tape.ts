// lib/effort-tape.ts
// Bucketing math for the Atlas "scrub the run" effort tape
// (design_handoff_atlas/README.md section 4): 120 columns spanning the
// activity, each encoding that slice's mean heart rate as a bar height +
// opacity (colour comes from the zone, resolved by the caller/component so
// this stays a pure data module), plus that slice's mean pace for the
// overlaid line.

import { zoneIndexForHr } from './hr-zones';

export interface EffortColumn {
  heightFrac: number; // 0..1 - 0 when the column has no real HR samples (e.g. before the activity started)
  opacity: number; // 0..1, same "no data" contract as heightFrac
  zone: number; // -1..4, -1 = no data or below every configured zone floor
  paceMinPerKm: number | null; // this column's mean pace, null when it has no samples
}

// Heart rate is normalised over this fixed band, matching the design
// brief's own 120-190 bpm range - a real, useful band across resting-to-max
// effort, not derived per-activity (unlike pace below, which genuinely
// varies too much by sport/fitness to hardcode).
const HR_NORM_MIN = 120;
const HR_NORM_MAX = 190;

export function buildEffortColumns(hr: number[], hrZoneBoundaries: number[], pace: number[], columns: number): EffortColumn[] {
  const n = Math.min(hr.length, pace.length);
  if (n === 0 || columns <= 0) return [];

  const hrSum = new Array<number>(columns).fill(0);
  const hrCount = new Array<number>(columns).fill(0);
  const paceSum = new Array<number>(columns).fill(0);
  const paceCount = new Array<number>(columns).fill(0);

  for (let i = 0; i < n; i++) {
    const c = Math.min(columns - 1, Math.floor((i / n) * columns));
    const hrVal = hr[i]!;
    if (hrVal > 0) {
      hrSum[c]! += hrVal;
      hrCount[c]! += 1;
    }
    const paceVal = pace[i]!;
    if (Number.isFinite(paceVal) && paceVal > 0) {
      paceSum[c]! += paceVal;
      paceCount[c]! += 1;
    }
  }

  const result: EffortColumn[] = [];
  for (let c = 0; c < columns; c++) {
    const count = hrCount[c]!;
    const meanPace = paceCount[c]! > 0 ? paceSum[c]! / paceCount[c]! : null;
    if (count === 0) {
      result.push({ heightFrac: 0, opacity: 0, zone: -1, paceMinPerKm: meanPace });
      continue;
    }
    const mean = hrSum[c]! / count;
    const norm = Math.max(0, Math.min(1, (mean - HR_NORM_MIN) / (HR_NORM_MAX - HR_NORM_MIN)));
    result.push({
      heightFrac: 0.28 + norm * 0.72,
      opacity: 0.5 + norm * 0.5,
      zone: zoneIndexForHr(mean, hrZoneBoundaries),
      paceMinPerKm: meanPace
    });
  }
  return result;
}
