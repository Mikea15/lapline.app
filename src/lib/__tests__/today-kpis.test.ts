import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Activity } from '../types';
import {
  chronicRamp,
  vo2BandBounds,
  vo2Band,
  vo2ScalePosition,
  volumeBucketFor,
  runVolumeBars,
  timeBySport,
  zoneSeconds,
  weeklyZoneSeconds,
  intensityShares
} from '../today-kpis';

// Fixed local "today" so daysAgo()-based windows are deterministic.
const TODAY = new Date(2024, 5, 15, 12, 0, 0);

beforeEach(() => vi.useFakeTimers().setSystemTime(TODAY));
afterEach(() => vi.useRealTimers());

let nextId = 1;
function activity(overrides: Partial<Activity>): Activity {
  return {
    id: nextId++,
    date: '2024-06-15',
    sport: 'running',
    durationMin: 0,
    distanceKm: 0,
    avgHR: 0,
    maxHR: 0,
    calories: 0,
    avgCadence: 0,
    maxCadence: 0,
    ascentM: 0,
    descentM: 0,
    avgSpeedKmh: 0,
    maxSpeedKmh: 0,
    bestPaceMinPerKm: 0,
    avgStrideLengthM: 0,
    timeInZoneSec: [],
    hrZoneBoundaries: [],
    aerobicTrainingEffect: 0,
    anaerobicTrainingEffect: 0,
    workoutFeel: null,
    workoutRpe: null,
    startTimeLabel: '',
    sweatLossMl: 0,
    recoveryHrBpm: 0,
    garminVo2Max: 0,
    recoveryTimeHours: 0,
    poolLengthM: 0,
    ...overrides
  };
}

function daysAgoDate(days: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('chronicRamp', () => {
  it('compares the last value with the one `weeks` before it', () => {
    const r = chronicRamp([50, 100, 100, 100, 200]);
    expect(r.changePct).toBeCloseTo(300, 6);
    expect(r.perWeekPct).toBeCloseTo((Math.pow(4, 1 / 4) - 1) * 100, 6);
    expect(r.status).toBe('steep');
  });

  it('calls a build within 8%/wk "building", and a drop "easing"', () => {
    expect(chronicRamp([100, 0, 0, 0, 120]).status).toBe('building'); // ~4.7%/wk
    expect(chronicRamp([100, 0, 0, 0, 80]).status).toBe('easing');
    expect(chronicRamp([100, 0, 0, 0, 101]).status).toBe('steady');
  });

  it('has no percentage without a baseline', () => {
    expect(chronicRamp([0, 0, 0, 0, 50])).toEqual({ changePct: null, perWeekPct: null, status: 'building' });
    expect(chronicRamp([10])).toEqual({ changePct: null, perWeekPct: null, status: 'building' });
    expect(chronicRamp([])).toEqual({ changePct: null, perWeekPct: null, status: 'steady' });
  });
});

describe('VO2max bands', () => {
  it('picks the age group and sex', () => {
    expect(vo2BandBounds(25, 'male')).toEqual([36.5, 42.5, 46.5, 52.5]);
    expect(vo2BandBounds(30, 'male')).toEqual([35.5, 41.0, 45.0, 49.5]);
    expect(vo2BandBounds(45, 'female')).toEqual([24.5, 29.0, 32.9, 37.0]);
    expect(vo2BandBounds(80, 'female')).toEqual([20.2, 24.5, 30.3, 31.5]);
    expect(vo2BandBounds(16, 'male')).toEqual([38.4, 45.2, 51.0, 56.0]);
  });

  it('rates a value, lower bounds inclusive', () => {
    const b = vo2BandBounds(25, 'male');
    expect(vo2Band(30, b)).toBe('poor');
    expect(vo2Band(36.5, b)).toBe('fair');
    expect(vo2Band(46.4, b)).toBe('good');
    expect(vo2Band(48.4, b)).toBe('excellent');
    expect(vo2Band(60, b)).toBe('superior');
  });

  it('places values on five equal-width bands', () => {
    const b: [number, number, number, number] = [30, 40, 50, 60];
    expect(vo2ScalePosition(30, b)).toBeCloseTo(0.2, 6);
    expect(vo2ScalePosition(45, b)).toBeCloseTo(0.5, 6);
    expect(vo2ScalePosition(60, b)).toBeCloseTo(0.8, 6);
    expect(vo2ScalePosition(5, b)).toBe(0);
    expect(vo2ScalePosition(99, b)).toBe(1);
  });
});

describe('runVolumeBars', () => {
  it('chooses days, weeks or months by range length', () => {
    expect(volumeBucketFor(7)).toBe('day');
    expect(volumeBucketFor(84)).toBe('week');
    expect(volumeBucketFor(365)).toBe('month');
  });

  it('splits a year into calendar months ending with this one', () => {
    const acts = [
      activity({ date: '2024-06-02', distanceKm: 10 }),
      activity({ date: '2024-05-31', distanceKm: 5 }),
      activity({ date: '2023-07-10', distanceKm: 3 }),
      activity({ date: '2023-06-10', distanceKm: 99 }), // before the window
      activity({ date: '2024-06-01', distanceKm: 40, sport: 'cycling' })
    ];
    const { bucket, bars } = runVolumeBars(acts, 365);
    expect(bucket).toBe('month');
    expect(bars).toHaveLength(12);
    expect(bars.map((b) => b.label).join('')).toBe('JASONDJFMAMJ');
    expect(bars[0]).toMatchObject({ km: 3, title: 'Jul 2023', current: false });
    expect(bars[10]!.km).toBe(5);
    expect(bars[11]).toMatchObject({ km: 10, title: 'Jun 2024', current: true });
  });

  it('splits a short range into days counting back from today', () => {
    const { bucket, bars } = runVolumeBars([activity({ date: daysAgoDate(0), distanceKm: 4 }), activity({ date: daysAgoDate(6), distanceKm: 6 })], 7);
    expect(bucket).toBe('day');
    expect(bars.map((b) => b.km)).toEqual([6, 0, 0, 0, 0, 0, 4]);
    expect(bars[6]!.current).toBe(true);
  });
});

describe('timeBySport', () => {
  it('sums hours per sport family in the window, most first', () => {
    const acts = [
      activity({ sport: 'running', durationMin: 60 }),
      activity({ sport: 'trail_running', durationMin: 30, date: daysAgoDate(3) }),
      activity({ sport: 'cycling', durationMin: 120 }),
      activity({ sport: 'cycling', durationMin: 600, date: daysAgoDate(30) }) // outside
    ];
    expect(timeBySport(acts, 28)).toEqual([
      { family: 'cycling', hours: 2 },
      { family: 'running', hours: 1.5 }
    ]);
  });
});

describe('zoneSeconds', () => {
  it('totals zones over a window of days back from today', () => {
    const acts = [
      activity({ timeInZoneSec: [10, 20, 30, 40, 50] }),
      activity({ date: daysAgoDate(10), timeInZoneSec: [1, 1, 1, 1, 1] }),
      activity({ timeInZoneSec: [5, 5] }) // malformed, skipped
    ];
    expect(zoneSeconds(acts, 7)).toEqual([10, 20, 30, 40, 50]);
    expect(zoneSeconds(acts, 14, 7)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('weeklyZoneSeconds', () => {
  it('buckets zone time into 7-day weeks ending today', () => {
    const acts = [
      activity({ timeInZoneSec: [1, 2, 3, 4, 5] }),
      activity({ date: daysAgoDate(6), timeInZoneSec: [1, 0, 0, 0, 0] }),
      activity({ date: daysAgoDate(7), timeInZoneSec: [0, 0, 0, 0, 9] }),
      activity({ date: daysAgoDate(30), timeInZoneSec: [9, 9, 9, 9, 9] }) // outside
    ];
    expect(weeklyZoneSeconds(acts, 2)).toEqual([
      [0, 0, 0, 0, 9],
      [2, 2, 3, 4, 5]
    ]);
  });
});

describe('intensityShares', () => {
  it('splits easy / moderate / hard against the polarised targets', () => {
    const s = intensityShares([41, 24, 18, 12, 5])!;
    expect(s.map((x) => Math.round(x.pct))).toEqual([65, 18, 17]);
    expect(s.map((x) => x.target)).toEqual([80, 5, 15]);
    expect(s.map((x) => x.onTarget)).toEqual([false, false, true]);
  });

  it('is null with no zone time', () => {
    expect(intensityShares([0, 0, 0, 0, 0])).toBeNull();
  });
});
