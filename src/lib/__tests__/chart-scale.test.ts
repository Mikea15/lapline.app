import { describe, it, expect } from 'vitest';
import { chartLabelFontSize } from '../chart-scale';

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
