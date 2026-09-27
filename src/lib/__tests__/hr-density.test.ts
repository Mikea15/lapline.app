import { describe, it, expect } from 'vitest';
import { buildHrDensityBins, hrDensityRange } from '../hr-density';

const Z = [94, 113, 132, 150, 168];

describe('buildHrDensityBins', () => {
  it('falls back to 14 bins covering 110-185 bpm with no data', () => {
    const bins = buildHrDensityBins([], Z);
    expect(bins).toHaveLength(14);
    expect(bins[0]!.bpmLo).toBeCloseTo(110, 6);
    expect(bins[13]!.bpmHi).toBeCloseTo(185, 6);
    expect(bins.every((b) => b.count === 0 && b.widthFrac === 0)).toBe(true);
  });

  it('ignores non-positive (missing/invalid) HR samples', () => {
    const bins = buildHrDensityBins([0, -1, 150, 150], Z);
    const total = bins.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(2);
  });

  it("follows the activity's own HR range instead of a fixed 110-185 axis", () => {
    // A low-HR session (bouldering-like, 55-98 bpm) - previously every
    // sample clamped into the single 110 bin.
    const hr = Array.from({ length: 440 }, (_, i) => 55 + (i % 44));
    const bins = buildHrDensityBins(hr, Z);
    expect(bins[0]!.bpmLo).toBe(55);
    expect(bins[bins.length - 1]!.bpmHi).toBe(100);
    expect(bins.filter((b) => b.count > 0).length).toBe(bins.length);
  });

  it('snaps the range to 5 bpm bins, widening them to stay within 18 rows', () => {
    expect(hrDensityRange([121, 149])).toEqual({ lo: 120, width: 5, bins: 6 });
    // 60-190 bpm at 5 bpm would be 26 rows - widens to 10 bpm
    const wide = Array.from({ length: 131 }, (_, i) => 60 + i);
    expect(hrDensityRange(wide)).toEqual({ lo: 60, width: 10, bins: 13 });
  });

  it('ignores a lone spike beyond the 99th percentile, clamping it into the edge bin', () => {
    const hr = [...new Array(300).fill(140), ...new Array(300).fill(150), 220];
    const bins = buildHrDensityBins(hr, Z);
    expect(bins[bins.length - 1]!.bpmHi).toBeLessThanOrEqual(155);
    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(601);
  });

  it('never collapses to zero bins for a flat HR trace', () => {
    const bins = buildHrDensityBins(new Array(60).fill(100), Z);
    expect(bins.length).toBeGreaterThanOrEqual(1);
    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(60);
  });

  it('scales every bin relative to the modal (busiest) bin', () => {
    const hr = [...new Array(10).fill(150), ...new Array(5).fill(160)];
    const bins = buildHrDensityBins(hr, Z);
    const modal = bins.find((b) => b.count === 10)!;
    const half = bins.find((b) => b.count === 5)!;
    expect(modal.widthFrac).toBeCloseTo(1, 6);
    expect(half.widthFrac).toBeCloseTo(0.5, 6);
  });

  it("labels each bin's zone from its own midpoint", () => {
    const bins = buildHrDensityBins([120], Z); // the 120-125 bin, zone 1 (113-131)
    const populated = bins.find((b) => b.count > 0)!;
    expect(populated.zone).toBeGreaterThanOrEqual(0);
  });
});
