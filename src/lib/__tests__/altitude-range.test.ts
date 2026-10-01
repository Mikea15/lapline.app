import { describe, it, expect } from 'vitest';
import { altitudeRange } from '../altitude-range';

describe('altitudeRange', () => {
  it('is null with no readings', () => {
    expect(altitudeRange([])).toBeNull();
    expect(altitudeRange([0, 0, 0])).toBeNull();
  });

  it('ignores zero (missing) readings', () => {
    expect(altitudeRange([0, 10, 0, 20, 0])).toEqual({ min: 10, max: 20 });
  });

  it('is the full range for a clean stream', () => {
    const alt = Array.from({ length: 101 }, (_, i) => 10 + i * 0.5);
    expect(altitudeRange(alt)).toEqual({ min: 11, max: 59 });
  });

  it("doesn't let a brief multi-sample excursion set the range", () => {
    const alt = Array.from({ length: 1000 }, (_, i) => 20 + (i % 10));
    for (let i = 500; i < 505; i++) alt[i] = 180; // a 5-sample GPS glitch
    for (let i = 700; i < 705; i++) alt[i] = -30;
    expect(altitudeRange(alt)).toEqual({ min: 20, max: 29 });
  });
});
