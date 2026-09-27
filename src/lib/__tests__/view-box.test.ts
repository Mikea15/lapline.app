import { describe, it, expect } from 'vitest';
import { fitViewBox, viewBoxAttr } from '../view-box';

describe('fitViewBox', () => {
  it('falls back to the full 1000 square with no points', () => {
    expect(fitViewBox([])).toEqual({ x: 0, y: 0, w: 1000, h: 1000, unit: 1 });
  });

  it('frames the points tightly, padded by a fraction of the larger side', () => {
    const vb = fitViewBox([{ x: 400, y: 300 }, { x: 600, y: 400 }], 0.1);
    // larger side 200 -> 20 padding each side
    expect(vb).toEqual({ x: 380, y: 280, w: 240, h: 140, unit: 0.24 });
  });

  it('adds extra room on top only', () => {
    const vb = fitViewBox([{ x: 0, y: 100 }, { x: 100, y: 200 }], 0, 0.5);
    expect(vb.y).toBe(50);
    expect(vb.h).toBe(150);
    expect(vb.x).toBe(0);
    expect(vb.w).toBe(100);
  });

  it('never collapses to a zero-size box', () => {
    const vb = fitViewBox([{ x: 5, y: 5 }], 0.05);
    expect(vb.w).toBeGreaterThan(0);
    expect(vb.h).toBeGreaterThan(0);
  });

  it('formats a viewBox attribute', () => {
    expect(viewBoxAttr({ x: 1, y: 2.25, w: 3, h: 4, unit: 1 })).toBe('1.0 2.3 3.0 4.0');
  });
});
