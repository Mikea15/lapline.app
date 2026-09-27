import { describe, it, expect } from 'vitest';
import { smooth121, projectIsometricRoute, type ElevatedFix } from '../isometric';

describe('smooth121', () => {
  it('returns a copy unchanged for fewer than 3 values', () => {
    expect(smooth121([])).toEqual([]);
    expect(smooth121([5])).toEqual([5]);
    expect(smooth121([1, 2])).toEqual([1, 2]);
  });

  it('clamps the endpoints and averages interior points with a 1-2-1 kernel', () => {
    // p'_1 = (p0 + 2*p1 + p2) / 4 = (0 + 2*4 + 8) / 4 = 4
    // p'_2 = (p1 + 2*p2 + p3) / 4 = (4 + 2*8 + 8) / 4 = 7
    expect(smooth121([0, 4, 8, 8])).toEqual([0, 4, 7, 8]);
  });
});

describe('projectIsometricRoute', () => {
  it('returns null for fewer than 2 fixes', () => {
    expect(projectIsometricRoute([])).toBeNull();
    expect(projectIsometricRoute([{ lat: 0, lon: 0, alt: 0 }])).toBeNull();
  });

  it('fits every layer into the 1000-wide viewBox', () => {
    const fixes: ElevatedFix[] = [
      { lat: 51.5, lon: -0.1, alt: 10 },
      { lat: 51.51, lon: -0.1, alt: 20 },
      { lat: 51.5, lon: -0.09, alt: 15 }
    ];
    const route = projectIsometricRoute(fixes)!;
    expect(route).not.toBeNull();
    expect(route.viewBoxSize).toBe(1000);
    expect(route.groundQuad).toHaveLength(4);
    expect(route.gridLines).toHaveLength(6);
    for (const p of [...route.track, ...route.floor, ...route.groundQuad]) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-6);
      expect(p.x).toBeLessThanOrEqual(1000 + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(-1e-6);
      expect(p.y).toBeLessThanOrEqual(1000 + 1e-6);
    }
  });

  it('lifts elevated fixes above their own floor shadow (smaller y = higher on screen)', () => {
    // A straight line of fixes with a real elevation plateau in the middle -
    // the endpoints share the same (zero) elevation as their floor point, so
    // clamped smoothing should leave them exactly coincident with the floor,
    // while the elevated middle fixes should be pulled measurably upward.
    const fixes: ElevatedFix[] = [];
    for (let i = 0; i < 9; i++) {
      const elevated = i >= 3 && i <= 5;
      fixes.push({ lat: 51.5 + i * 0.001, lon: -0.1, alt: elevated ? 200 : 0 });
    }
    const route = projectIsometricRoute(fixes)!;

    // Endpoint: no elevation anywhere near it, track should sit on its floor.
    expect(route.track[0]!.y).toBeCloseTo(route.floor[0]!.y, 5);

    // Elevated middle fix: track should be pulled up (smaller y) relative to
    // its own floor shadow.
    const liftAtPeak = route.floor[4]!.y - route.track[4]!.y;
    expect(liftAtPeak).toBeGreaterThan(5);
  });

  it('does not divide by zero when every fix is the same point', () => {
    const fixes: ElevatedFix[] = [
      { lat: 51.5, lon: -0.1, alt: 10 },
      { lat: 51.5, lon: -0.1, alt: 10 }
    ];
    const route = projectIsometricRoute(fixes)!;
    expect(route).not.toBeNull();
    for (const p of route.track) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
