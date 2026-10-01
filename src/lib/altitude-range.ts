// lib/altitude-range.ts
// The min-max altitude shown next to an activity's ascent. GPS-only altitude
// (no barometer) wanders by tens of metres for several samples at a time,
// which sanitizeAltitudeSpikes (one-sample spikes only) can't remove, so the
// absolute extremes made a near-sea-level run read as -33 to 186 m
// (bug-list.md). The range is the 2nd-98th percentile instead, so brief
// excursions don't set it. Zeros are "no reading" and are ignored.

const LO = 0.02;
const HI = 0.98;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.round((sorted.length - 1) * p)]!;
}

export function altitudeRange(altitude: number[]): { min: number; max: number } | null {
  const vals = altitude.filter((v) => v !== 0).sort((a, b) => a - b);
  if (vals.length === 0) return null;
  return { min: percentile(vals, LO), max: percentile(vals, HI) };
}
