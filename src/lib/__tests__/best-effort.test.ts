import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bestTimeForDistance, bestDistanceForDuration, kmSplitPaces, bestWindowPace, plausibleDistance, maxPlausibleSpeedMps } from '../best-effort';
import { parseFIT } from '../fit-parser';

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

// 1 Hz samples at `speed` m/s; `extra` adds metres at given seconds (a glitch).
function steadyStream(seconds: number, speed: number, extra: Record<number, number> = {}) {
  const t: number[] = [];
  const distance: number[] = [];
  let d = 0;
  for (let s = 0; s <= seconds; s++) {
    if (s > 0) d += speed + (extra[s] ?? 0);
    t.push(s);
    distance.push(d);
  }
  return { t, distance };
}

describe('maxPlausibleSpeedMps', () => {
  it('caps running and cycling, leaves other sports as recorded', () => {
    expect(maxPlausibleSpeedMps('running')).toBe(12);
    expect(maxPlausibleSpeedMps('trail_running')).toBe(12);
    expect(maxPlausibleSpeedMps('cycling')).toBe(30);
    expect(maxPlausibleSpeedMps('lap_swimming')).toBe(Infinity);
    expect(maxPlausibleSpeedMps('cardio_training')).toBe(Infinity);
  });
});

describe('plausibleDistance', () => {
  it('returns the same array when nothing is faster than the limit', () => {
    const { t, distance } = steadyStream(600, 11.9);
    expect(plausibleDistance(distance, t, 12)).toBe(distance);
    expect(plausibleDistance(distance, t, Infinity)).toBe(distance);
  });

  it('replaces a spike with the speed around it and shifts the rest down', () => {
    const { t, distance } = steadyStream(100, 3, { 50: 52 }); // 55 m in one second
    const clean = plausibleDistance(distance, t, 12);
    expect(distance).toEqual(steadyStream(100, 3, { 50: 52 }).distance); // input untouched
    clean.forEach((d, i) => expect(d).toBeCloseTo(3 * i, 9));
  });

  it('treats distance gained with no time passing as a spike', () => {
    const t = [0, 1, 2, 2, 3, 4];
    const distance = [0, 3, 6, 40, 43, 46];
    expect(plausibleDistance(distance, t, 12)).toEqual([0, 3, 6, 6, 9, 12]);
  });

  it('falls back to the limit when no neighbour is plausible', () => {
    expect(plausibleDistance([0, 100, 200], [0, 1, 2], 12)).toEqual([0, 12, 24]);
  });
});

describe('best efforts on a spiky stream', () => {
  // A steady 5:00 /km run (3.33 m/s) for an hour, with a 60 m glitch in one
  // second and 90 m more across a 6 s gap between samples.
  const glitch = steadyStream(3600, 1000 / 300, { 1200: 60, 2400: 90 });
  const kept = (s: number) => s <= 2394 || s >= 2400;
  const t = glitch.t.filter(kept);
  const distance = glitch.distance.filter((_, s) => kept(s));
  const cap = maxPlausibleSpeedMps('running');

  it('reads too fast as recorded', () => {
    expect(bestTimeForDistance(distance, t, 1000)!).toBeLessThan(280);
    expect(bestWindowPace(distance, t)!).toBeLessThan(4.7);
  });

  it('matches the steady pace in every best effort with the running limit', () => {
    expect(bestTimeForDistance(distance, t, 1000, cap)).toBeCloseTo(300, 6);
    expect(bestTimeForDistance(distance, t, 5000, cap)).toBeCloseTo(1500, 6);
    expect(bestWindowPace(distance, t, 1000, cap)).toBeCloseTo(5, 6);
    expect(bestDistanceForDuration(distance, t, 600, cap)).toBeCloseTo(2000, 6);
    const splits = kmSplitPaces(distance, t, 1000, cap);
    expect(splits).toHaveLength(12);
    for (const pace of splits) expect(pace).toBeCloseTo(5, 6);
  });

  it('leaves clean data alone, however fast for its sport', () => {
    // A ride with 25 m/s sprints and stops: nothing over the cycling limit.
    const t: number[] = [];
    const distance: number[] = [];
    let d = 0;
    for (let s = 0; s <= 3600; s++) {
      if (s > 0) d += s % 600 < 30 ? 25 : s % 900 < 60 ? 0 : 8 + 4 * Math.sin(s / 50);
      t.push(s);
      distance.push(d);
    }
    const bike = maxPlausibleSpeedMps('cycling');
    expect(bestTimeForDistance(distance, t, 5000, bike)).toBe(bestTimeForDistance(distance, t, 5000));
    expect(bestDistanceForDuration(distance, t, 60, bike)).toBe(bestDistanceForDuration(distance, t, 60));
    expect(kmSplitPaces(distance, t, 1000, bike)).toEqual(kmSplitPaces(distance, t));
  });
});

describe('best efforts on real recordings', () => {
  // Anonymised copies of real recordings (scripts/demo/make-test-fixtures.ts).
  const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures');
  async function stream(name: string) {
    const [pa] = await parseFIT(new Uint8Array(readFileSync(path.join(FIXTURES, name))));
    return { distance: pa!.records.map((r) => r.distance), t: pa!.records.map((r) => r.t), sport: pa!.activity.sport };
  }

  it("run-steady's distance glitches no longer make a 3:44 km", async () => {
    // The watch logged 55 m in 1 s and 83 m in 6 s late in this ~5:27 /km run.
    const { distance, t, sport } = await stream('run-steady.fit');
    expect(bestTimeForDistance(distance, t, 1000)!).toBeLessThan(225); // 3:44 as recorded
    const best = bestTimeForDistance(distance, t, 1000, maxPlausibleSpeedMps(sport))!;
    expect(best).toBeGreaterThan(250);
    expect(best).toBeLessThan(265); // 4:17
  });

  it('gives the same answers as before on recordings without glitches', async () => {
    for (const name of ['ride-morning.fit', 'ride-evening.fit', 'footy.fit']) {
      const { distance, t, sport } = await stream(name);
      expect(plausibleDistance(distance, t, maxPlausibleSpeedMps(sport))).toBe(distance);
    }
  });
});
