import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Activity, ActivityDetail } from '../types';
import { currentVo2Max, weeklyVo2MaxTrend } from '../vo2max';
import { effortsFromDetails } from './efforts-lookup';

const TODAY = new Date(2024, 5, 15, 12, 0, 0);
beforeEach(() => vi.useFakeTimers().setSystemTime(TODAY));
afterEach(() => vi.useRealTimers());

let nextId = 1;
function activity(overrides: Partial<Activity>): Activity {
  return {
    id: nextId++,
    date: '2024-06-01',
    sport: 'running',
    durationMin: 0,
    distanceKm: 1,
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

// Constant-velocity stream, long enough (6000s) to cover every candidate
// duration used internally (up to 5400s / 90 min).
function constantPaceDetail(a: Activity, speedMPerSec: number): ActivityDetail {
  const totalSec = 6000;
  return {
    ...a,
    t: [0, totalSec],
    distance: [0, totalSec * speedMPerSec],
    hr: [0, 0],
    cadence: [0, 0],
    power: [0, 0],
    temperature: [0, 0],
    altitude: [0, 0],
    speed: [0, 0],
    perfCondition: [null, null],
    lat: [null, null],
    lon: [null, null],
    laps: [],
    lengths: []
  };
}

function daysAgoDate(days: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('currentVo2Max', () => {
  it('returns null with no qualifying running activities', async () => {
    const result = await currentVo2Max([], async () => null);
    expect(result).toEqual({ value: null, activityId: null, date: null });
  });

  it('picks the activity with the higher estimate when a faster real effort exists', async () => {
    const slow = activity({ date: daysAgoDate(10) }); // 5:00/km ~ 3.33 m/s
    const fast = activity({ date: daysAgoDate(3) }); // 4:00/km = 4.17 m/s
    const details = new Map([
      [slow.id, constantPaceDetail(slow, 1000 / 300)],
      [fast.id, constantPaceDetail(fast, 1000 / 240)]
    ]);
    const result = await currentVo2Max([slow, fast], effortsFromDetails(details));
    expect(result.activityId).toBe(fast.id);
    expect(result.date).toBe(fast.date);
    expect(result.value).not.toBeNull();
    expect(result.value!).toBeGreaterThan(0);
  });

  it('only counts efforts from the last 90 days', async () => {
    const old = activity({ date: daysAgoDate(120) });
    const recent = activity({ date: daysAgoDate(5) });
    const details = new Map([
      [old.id, constantPaceDetail(old, 1000 / 200)], // faster, but stale
      [recent.id, constantPaceDetail(recent, 1000 / 300)]
    ]);
    const result = await currentVo2Max([old, recent], effortsFromDetails(details));
    expect(result.activityId).toBe(recent.id);
  });

  it('ignores non-running activities entirely', async () => {
    const ride = activity({ sport: 'cycling', date: daysAgoDate(1) });
    const details = new Map([[ride.id, constantPaceDetail(ride, 1000 / 150)]]); // very fast, but not a run
    const result = await currentVo2Max([ride], effortsFromDetails(details));
    expect(result.value).toBeNull();
  });
});

describe('weeklyVo2MaxTrend', () => {
  it('is null before any qualifying effort has happened', async () => {
    const a = activity({ date: daysAgoDate(7) });
    const details = new Map([[a.id, constantPaceDetail(a, 1000 / 240)]]);
    const trend = await weeklyVo2MaxTrend([a], effortsFromDetails(details), 6);
    // 6 weekly points, oldest -> newest; the oldest (asOf ~35 days ago) predates the effort.
    expect(trend[0]).toBeNull();
    expect(trend[trend.length - 1]).not.toBeNull();
  });

  it('drops an effort out of the trailing 90-day window once it goes stale', async () => {
    const stale = activity({ date: daysAgoDate(200) });
    const details = new Map([[stale.id, constantPaceDetail(stale, 1000 / 240)]]);
    const trend = await weeklyVo2MaxTrend([stale], effortsFromDetails(details), 4);
    // The most recent week's "as of today" 90-day window can't reach 200 days back.
    expect(trend[trend.length - 1]).toBeNull();
  });

  it('returns exactly numWeeks points', async () => {
    const trend = await weeklyVo2MaxTrend([], async () => null, 10);
    expect(trend).toHaveLength(10);
  });
});
