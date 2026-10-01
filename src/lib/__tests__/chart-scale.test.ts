import { describe, it, expect } from 'vitest';
import { chartLabelFontSize, axisLabelSlots } from '../chart-scale';

describe('chartLabelFontSize', () => {
  it('returns a smaller viewBox-unit size for a chart whose viewBox is wide relative to its container', () => {
    // A 1000-wide viewBox rendered into a 500px container is scaled down
    // 2x, so it needs a 2x bigger declared font-size to still read as 12px.
    expect(chartLabelFontSize(1000, 500, 12)).toBeCloseTo(24, 5);
  });

  it('returns a bigger viewBox-unit size for a chart whose viewBox is narrow relative to its container', () => {
    expect(chartLabelFontSize(400, 800, 12)).toBeCloseTo(6, 5);
  });

  it('two charts with different viewBox widths converge on the same real size at their own container width', () => {
    // Simulates the actual bug: TrendVolumeChart (viewBox 1000, full-width
    // ~1150px container) and Histogram (viewBox 1000, half-width ~570px
    // container) should both target the same real 11.5px text.
    const wide = chartLabelFontSize(1000, 1150, 11.5);
    const narrow = chartLabelFontSize(1000, 570, 11.5);
    expect(wide * 1150).toBeCloseTo(narrow * 570, 5);
  });

  it('falls back to the target size when the container has not been measured yet', () => {
    expect(chartLabelFontSize(1000, 0, 12)).toBe(12);
    expect(chartLabelFontSize(1000, -5, 12)).toBe(12);
  });
});

describe('axisLabelSlots', () => {
  it('labels every slot when they are wide enough', () => {
    expect([...axisLabelSlots(4, 100, 52)].sort()).toEqual([0, 1, 2, 3]);
  });

  it('thins to every stride-th slot back from the last', () => {
    // 22px slots, 52px labels -> stride 3; 3*22 + 11 = 77 >= 40*1.5 + 12.
    expect([...axisLabelSlots(10, 22, 52)].sort((a, b) => a - b)).toEqual([0, 3, 6, 9]);
  });

  it("drops both edge labels' neighbours when they'd overlap", () => {
    // 20px slots -> stride 3; 3*20 + 10 = 70 < 72.
    expect([...axisLabelSlots(10, 20, 52)].sort((a, b) => a - b)).toEqual([0, 9]);
  });

  it("drops the last label's neighbour when the pinned edge label would overlap it", () => {
    // 30px slots, 52px labels -> stride 2; 2*30 + 15 = 75 >= 72, fits.
    expect([...axisLabelSlots(6, 30, 52)].sort((a, b) => a - b)).toEqual([1, 3, 5]);
    // 26px slots -> stride 2; 2*26 + 13 = 65 < 72, so slot 3 goes.
    expect([...axisLabelSlots(6, 26, 52)].sort((a, b) => a - b)).toEqual([1, 5]);
  });
});
