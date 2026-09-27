import { describe, it, expect } from 'vitest';
import { projectFlatRoute } from '../flat-route';

describe('projectFlatRoute', () => {
  it('returns null for fewer than 2 fixes', () => {
    expect(projectFlatRoute([])).toBeNull();
    expect(projectFlatRoute([{ lat: 0, lon: 0 }])).toBeNull();
  });

  it('fits every point into the 1000-wide viewBox', () => {
    const points = projectFlatRoute([
      { lat: 51.5, lon: -0.1 },
      { lat: 51.51, lon: -0.1 },
      { lat: 51.5, lon: -0.09 }
    ])!;
    expect(points).toHaveLength(3);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1000);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1000);
    }
  });

  it('places a more northerly (higher latitude) fix higher on screen (smaller y)', () => {
    const points = projectFlatRoute([
      { lat: 51.5, lon: -0.1 },
      { lat: 51.6, lon: -0.1 }
    ])!;
    expect(points[1]!.y).toBeLessThan(points[0]!.y);
  });

  it('does not divide by zero when every fix is the same point', () => {
    const points = projectFlatRoute([
      { lat: 51.5, lon: -0.1 },
      { lat: 51.5, lon: -0.1 }
    ])!;
    for (const p of points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
