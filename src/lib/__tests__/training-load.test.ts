import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Activity } from '../types';
import {
  weeklyLoadBuckets,
  trailingMean,
  loadBand,
  acuteChronicRatio,
  runVolumeKm,
  activityLoad
} from '../training-load';

// Fixed "today" so daysAgo()-based windows are deterministic. Built (and
// walked, below) entirely in local time to match daysAgo()'s own use of
// unqualified `new Date(...)`/`Date#getters`, so this test isn't sensitive
// to the runner's timezone.
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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('weeklyLoadBuckets + trailingMean', () => {
  it('buckets a run into the current (most recent) week and computes load in "au"', () => {
    const acts = [activity({ sport: 'running', durationMin: 60, date: daysAgoDate(0) })];
    const buckets = weeklyLoadBuckets(acts, 4);
    expect(buckets).toHaveLength(4);
    expect(buckets[3]!.isCurrent).toBe(true);
    expect(buckets[3]!.load).toBeCloseTo(68, 5); // 1h running * 68 au/h
    expect(buckets[0]!.load).toBe(0);
  });

  it('ignores sports with no load-per-hour mapping', () => {
    const acts = [activity({ sport: 'strength_training', durationMin: 60, date: daysAgoDate(0) })];
    const buckets = weeklyLoadBuckets(acts, 1);
    expect(buckets[0]!.load).toBe(0);
  });

  it('trailingMean averages only the weeks available before each point', () => {
    const loads = [10, 20, 30, 40];
    const mean = trailingMean(loads, 2);
    expect(mean[0]).toBe(10); // no prior week yet
    expect(mean[1]).toBe(15); // (10+20)/2
    expect(mean[2]).toBe(25); // (20+30)/2
    expect(mean[3]).toBe(35); // (30+40)/2
  });
});

describe('activityLoad', () => {
  it('applies the per-sport au/hour rate, and 0 for sports with no mapping', () => {
    expect(activityLoad(activity({ sport: 'running', durationMin: 30 }))).toBeCloseTo(34, 5); // 0.5h * 68
    expect(activityLoad(activity({ sport: 'cycling', durationMin: 60 }))).toBeCloseTo(38, 5);
    expect(activityLoad(activity({ sport: 'lap_swimming', durationMin: 60 }))).toBeCloseTo(44, 5);
    expect(activityLoad(activity({ sport: 'strength_training', durationMin: 60 }))).toBe(0);
  });
});

describe('loadBand', () => {
  it('classifies the ratio into the documented bands', () => {
    expect(loadBand(0.5)).toBe('detrain');
    expect(loadBand(1.0)).toBe('productive');
    expect(loadBand(1.4)).toBe('caution');
    expect(loadBand(2.0)).toBe('risk');
  });
});

describe('acuteChronicRatio', () => {
  it('is 0 with no chronic history yet', () => {
    const result = acuteChronicRatio([]);
    expect(result.chronic42d).toBe(0);
    expect(result.ratio).toBe(0);
    expect(result.band).toBe('detrain');
  });

  it('computes acute (7d) against chronic (42d, /6 weeks) real load', () => {
    const acts = [
      activity({ sport: 'running', durationMin: 60, date: daysAgoDate(1) }), // in both windows
      activity({ sport: 'running', durationMin: 60, date: daysAgoDate(40) }) // chronic only
    ];
    const result = acuteChronicRatio(acts);
    expect(result.acute7d).toBeCloseTo(68, 5);
    expect(result.chronic42d).toBeCloseTo((68 + 68) / 6, 5);
  });

  it('excludes future-dated activities', () => {
    const acts = [activity({ sport: 'running', durationMin: 60, date: daysAgoDate(-1) })];
    const result = acuteChronicRatio(acts);
    expect(result.acute7d).toBe(0);
  });
});

describe('runVolumeKm', () => {
  it('sums only running distance within the trailing window', () => {
    const acts = [
      activity({ sport: 'running', distanceKm: 5, date: daysAgoDate(2) }),
      activity({ sport: 'cycling', distanceKm: 20, date: daysAgoDate(2) }), // wrong sport
      activity({ sport: 'running', distanceKm: 10, date: daysAgoDate(10) }) // outside window
    ];
    expect(runVolumeKm(acts, 7)).toBeCloseTo(5, 5);
  });
});
