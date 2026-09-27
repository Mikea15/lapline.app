import { describe, it, expect } from 'vitest';
import { bestTimeForDistance, bestDistanceForDuration, kmSplitPaces } from '../best-effort';

describe('bestTimeForDistance', () => {
  it('finds the fastest window covering the target distance, with interpolation', () => {
    // Constant 5 m/s for the first half, then a faster 10 m/s burst.
    const t = [0, 10, 20, 30, 40, 50];
    const distance = [0, 50, 100, 200, 300, 400];
    // Fastest 100m should be found inside the fast section (10 m/s -> 10s/100m).
    expect(bestTimeForDistance(distance, t, 100)).toBeCloseTo(10, 5);
  });

  it('returns null when the stream never covers the target distance', () => {
    const t = [0, 10, 20];
    const distance = [0, 50, 90];
    expect(bestTimeForDistance(distance, t, 1000)).toBeNull();
  });

  it('returns null for fewer than 2 samples', () => {
    expect(bestTimeForDistance([0], [0], 100)).toBeNull();
    expect(bestTimeForDistance([], [], 100)).toBeNull();
  });

  it('interpolates a fractional crossing time between samples', () => {
    // 0 -> 100m over 0 -> 20s (5 m/s constant), target 50m should land at t=10.
    const t = [0, 20];
    const distance = [0, 100];
    expect(bestTimeForDistance(distance, t, 50)).toBeCloseTo(10, 5);
  });
});

describe('bestDistanceForDuration', () => {
  it('finds the farthest distance covered in the duration window', () => {
    const t = [0, 10, 20, 30, 40];
    const distance = [0, 100, 300, 400, 500]; // fastest 10s window is t=10..20 (200m)
    expect(bestDistanceForDuration(distance, t, 10)).toBeCloseTo(200, 5);
  });

  it('returns null when the activity is shorter than the requested duration', () => {
    const t = [0, 5, 9];
    const distance = [0, 50, 90];
    expect(bestDistanceForDuration(distance, t, 60)).toBeNull();
  });

  it('returns null for fewer than 2 samples', () => {
    expect(bestDistanceForDuration([0], [0], 60)).toBeNull();
  });

  it('interpolates fractional distance at the window boundary', () => {
    const t = [0, 20];
    const distance = [0, 100]; // 5 m/s constant
    expect(bestDistanceForDuration(distance, t, 10)).toBeCloseTo(50, 5);
  });
});

describe('kmSplitPaces', () => {
  it('splits a constant-pace run into one entry per km', () => {
    // 5:00/km constant pace over 3km.
    const t = [0, 300, 600, 900];
    const distance = [0, 1000, 2000, 3000];
    expect(kmSplitPaces(distance, t)).toEqual([5, 5, 5]);
  });

  it('reflects a pace change between splits', () => {
    // 1st km at 5:00/km, 2nd km at 4:00/km.
    const t = [0, 300, 540];
    const distance = [0, 1000, 2000];
    const paces = kmSplitPaces(distance, t);
    expect(paces[0]).toBeCloseTo(5, 5);
    expect(paces[1]).toBeCloseTo(4, 5);
  });

  it('drops a trailing partial km', () => {
    const t = [0, 300, 450];
    const distance = [0, 1000, 1500]; // only 1.5km total
    expect(kmSplitPaces(distance, t)).toHaveLength(1);
  });

  it('interpolates the split boundary between samples', () => {
    const t = [0, 10, 20, 30, 40, 50];
    const distance = [0, 50, 100, 200, 300, 400]; // matches bestTimeForDistance's fixture
    const paces = kmSplitPaces(distance, t, 100);
    expect(paces).toHaveLength(4);
    expect(paces[0]).toBeCloseTo((20 / 60) * 10, 5); // 0->100m in 20s, normalized to min/km
    expect(paces[3]).toBeCloseTo((10 / 60) * 10, 5); // 300->400m in 10s, normalized to min/km
  });

  it('returns an empty array for streams shorter than one segment', () => {
    expect(kmSplitPaces([0, 500], [0, 150])).toEqual([]);
    expect(kmSplitPaces([0], [0])).toEqual([]);
  });
});
