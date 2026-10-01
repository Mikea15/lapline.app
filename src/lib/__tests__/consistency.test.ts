import { describe, it, expect } from 'vitest';
import type { Activity } from '../types';
import { daySummaries, depthLevel, longestStreak, weekdayShare } from '../consistency';

let nextId = 1;
function activity(date: string, sport: string, durationMin: number): Activity {
  return {
    id: nextId++,
    date,
    sport,
    durationMin,
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
    poolLengthM: 0
  };
}

describe('daySummaries', () => {
  it('totals each day and picks the sport with the most minutes', () => {
    const days = daySummaries([
      activity('2024-06-10', 'running', 30),
      activity('2024-06-10', 'cycling', 45),
      activity('2024-06-10', 'trail_running', 20),
      activity('2024-06-11', 'lap_swimming', 40),
      activity('2024-06-12', 'running', 0)
    ]);
    expect(days.get('2024-06-10')).toEqual({ minutes: 95, family: 'running' });
    expect(days.get('2024-06-11')).toEqual({ minutes: 40, family: 'pool-swim' });
    expect(days.has('2024-06-12')).toBe(false);
  });
});

describe('depthLevel', () => {
  it('steps at 30 min, 1 h and 2 h', () => {
    expect([0, 10, 29, 30, 59, 60, 119, 120, 300].map(depthLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('longestStreak', () => {
  it('finds the longest run of trained days in the window', () => {
    const days = daySummaries(['2024-06-01', '2024-06-02', '2024-06-04', '2024-06-05', '2024-06-06', '2024-06-09'].map((d) => activity(d, 'running', 30)));
    expect(longestStreak(days, '2024-06-01', '2024-06-10')).toBe(3);
    expect(longestStreak(days, '2024-06-05', '2024-06-10')).toBe(2);
    expect(longestStreak(new Map(), '2024-06-01', '2024-06-10')).toBe(0);
  });
});

describe('weekdayShare', () => {
  it("is each weekday's share of weeks trained, not counting days still to come", () => {
    // Mondays 3, 10, 17 June 2024; today is Wednesday 19 June.
    const days = daySummaries([
      activity('2024-06-03', 'running', 30), // Mon
      activity('2024-06-10', 'running', 30), // Mon
      activity('2024-06-19', 'running', 30), // Wed (today)
      activity('2024-06-14', 'running', 30) // Fri
    ]);
    const share = weekdayShare(days, '2024-06-03', '2024-06-19');
    expect(share[0]).toBeCloseTo(2 / 3, 6);
    expect(share[2]).toBeCloseTo(1 / 3, 6);
    expect(share[4]).toBeCloseTo(1 / 2, 6); // only 2 Fridays so far
  });
});
