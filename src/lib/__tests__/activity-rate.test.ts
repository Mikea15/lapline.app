import { describe, it, expect } from 'vitest';
import type { Activity } from '../types';
import { rateSortValue, activitySortValue } from '../activity-rate';

let nextId = 1;
function activity(overrides: Partial<Activity>): Activity {
  return {
    id: nextId++,
    date: '2024-01-01',
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

describe('rateSortValue', () => {
  it('returns pace (min/km) for running', () => {
    const a = activity({ sport: 'running', distanceKm: 5, durationMin: 25 });
    expect(rateSortValue(a)).toBeCloseTo(5, 5);
  });

  it('returns average speed for cycling', () => {
    const a = activity({ sport: 'cycling', avgSpeedKmh: 28.4 });
    expect(rateSortValue(a)).toBeCloseTo(28.4, 5);
  });

  it('returns seconds/100m for pool swim, falling back to the elapsed session duration when swimActiveDurationMin is unavailable (not yet re-parsed)', () => {
    const a = activity({ sport: 'pool-swim', distanceKm: 1, durationMin: 25 }); // 1500s / 10 * 100m units = 150s/100m
    expect(rateSortValue(a)).toBeCloseTo(150, 5);
  });

  it('prefers swimActiveDurationMin (excludes rest) over durationMin (includes rest) for pool swim, once available', () => {
    // Same 1km swim, but the session took 30 real minutes including rest -
    // only 20 of those were actually spent swimming. The real moving pace
    // (120s/100m) should win over the slower elapsed-including-rest one
    // (180s/100m) it would otherwise fall back to.
    const a = activity({ sport: 'pool-swim', distanceKm: 1, durationMin: 30, swimActiveDurationMin: 20 });
    expect(rateSortValue(a)).toBeCloseTo(120, 5);
  });

  it('returns max HR for other/cardio sports', () => {
    const a = activity({ sport: 'strength_training', maxHR: 142 });
    expect(rateSortValue(a)).toBe(142);
  });

  it('returns null when the sport-appropriate field is not recorded', () => {
    expect(rateSortValue(activity({ sport: 'running', distanceKm: 0 }))).toBeNull();
    expect(rateSortValue(activity({ sport: 'cycling', avgSpeedKmh: 0 }))).toBeNull();
    expect(rateSortValue(activity({ sport: 'pool-swim', distanceKm: 0 }))).toBeNull();
    expect(rateSortValue(activity({ sport: 'other', maxHR: 0 }))).toBeNull();
  });
});

describe('activitySortValue', () => {
  it('sorts date as a parsed timestamp', () => {
    const a = activity({ date: '2024-03-01' });
    const b = activity({ date: '2024-01-01' });
    expect(activitySortValue(a, 'date')).toBeGreaterThan(activitySortValue(b, 'date')!);
  });

  it('sorts time by durationMin, null when unrecorded', () => {
    expect(activitySortValue(activity({ durationMin: 42 }), 'time')).toBe(42);
    expect(activitySortValue(activity({ durationMin: 0 }), 'time')).toBeNull();
  });

  it('sorts distance by distanceKm, null when unrecorded', () => {
    expect(activitySortValue(activity({ distanceKm: 10 }), 'distance')).toBe(10);
    expect(activitySortValue(activity({ distanceKm: 0 }), 'distance')).toBeNull();
  });

  it('delegates pace to rateSortValue', () => {
    const a = activity({ sport: 'cycling', avgSpeedKmh: 30 });
    expect(activitySortValue(a, 'pace')).toBe(rateSortValue(a));
  });
});
