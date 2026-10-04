import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Activity, ActivityDetail } from '../types';
import { criticalPaceCurves, CRITICAL_PACE_DURATIONS_SEC } from '../critical-pace';
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

// A constant-velocity stream long enough to cover every candidate duration.
function constantPaceDetail(a: Activity, speedMPerSec: number, totalSec = 4000): ActivityDetail {
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

describe('criticalPaceCurves', () => {
  it('splits activities into "this block" and "the block before it" by age', async () => {
    const recent = activity({ date: daysAgoDate(1) });
    const previous = activity({ date: daysAgoDate(10) });
    const tooOld = activity({ date: daysAgoDate(30) });
    const details = new Map([
      [recent.id, constantPaceDetail(recent, 5)], // 5 m/s = 3:20/km
      [previous.id, constantPaceDetail(previous, 4)], // 4 m/s = 4:10/km
      [tooOld.id, constantPaceDetail(tooOld, 10)]
    ]);
    const getEfforts = effortsFromDetails(details);

    const curves = await criticalPaceCurves([recent, previous, tooOld], getEfforts, daysAgoDate(6), daysAgoDate(0));

    for (const point of curves.thisRange) {
      expect(point.paceMinPerKm).not.toBeNull();
      expect(point.paceMinPerKm).toBeCloseTo(1000 / 5 / 60, 3); // pace at 5 m/s
    }
    for (const point of curves.previousRange) {
      expect(point.paceMinPerKm).toBeCloseTo(1000 / 4 / 60, 3); // pace at 4 m/s
    }
  });

  it('returns null pace points when no activity covers a given duration', async () => {
    const short = activity({ date: daysAgoDate(1) });
    const details = new Map([[short.id, constantPaceDetail(short, 3, 30)]]); // only 30s of data
    const curves = await criticalPaceCurves([short], effortsFromDetails(details), daysAgoDate(6), daysAgoDate(0));
    const longest = curves.thisRange[curves.thisRange.length - 1]!;
    expect(longest.durationSec).toBe(CRITICAL_PACE_DURATIONS_SEC[CRITICAL_PACE_DURATIONS_SEC.length - 1]);
    expect(longest.paceMinPerKm).toBeNull();
  });

  it('excludes non-running activities from the curve', async () => {
    const ride = activity({ sport: 'cycling', date: daysAgoDate(1) });
    const details = new Map([[ride.id, constantPaceDetail(ride, 8)]]);
    const curves = await criticalPaceCurves([ride], effortsFromDetails(details), daysAgoDate(6), daysAgoDate(0));
    expect(curves.thisRange.every((p) => p.paceMinPerKm === null)).toBe(true);
  });
});
