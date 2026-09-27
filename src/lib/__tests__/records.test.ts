import { describe, it, expect } from 'vitest';
import type { Activity, ActivityDetail } from '../types';
import { computeAllRecords, currentRecordHolderIds, milestoneLadders } from '../records';

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

// A constant-pace stream covering `km` kilometres at `secPerKm` seconds/km.
function detailFor(a: Activity, km: number, secPerKm: number): ActivityDetail {
  const totalSec = km * secPerKm;
  const t = [0, totalSec];
  const distance = [0, km * 1000];
  return {
    ...a,
    t,
    hr: [0, 0],
    cadence: [0, 0],
    power: [0, 0],
    distance,
    temperature: [0, 0],
    altitude: [0, 0],
    speed: [0, 0],
    perfCondition: [null, null],
    lat: [null, null],
    lon: [null, null],
    maxHr: 0,
    laps: [],
    lengths: []
  };
}

function detailLookup(details: Map<number, ActivityDetail>) {
  return async (id: number) => details.get(id) ?? null;
}

describe('computeAllRecords', () => {
  it('finds the fastest pace-distance effort and its history, best-only', async () => {
    const slow = activity({ sport: 'running', date: '2024-01-01' });
    const fast = activity({ sport: 'running', date: '2024-01-08' });
    const details = new Map([
      [slow.id, detailFor(slow, 5, 300)], // 5km @ 5:00/km
      [fast.id, detailFor(fast, 5, 240)] // 5km @ 4:00/km (PR)
    ]);
    const records = await computeAllRecords([slow, fast], detailLookup(details));
    const r5k = records.find((r) => r.key === '5km')!;
    expect(r5k.bestValue).toBeCloseTo(1200, 1); // 4:00/km * 5km = 1200s
    expect(r5k.setByActivityId).toBe(fast.id);
    expect(r5k.previousValue).toBeCloseTo(1500, 1);
    expect(r5k.history.map((h) => h.activityId)).toEqual([slow.id, fast.id]);
  });

  it('never regresses the record when a later activity is slower', async () => {
    const fast = activity({ sport: 'running', date: '2024-01-01' });
    const slow = activity({ sport: 'running', date: '2024-01-08' });
    const details = new Map([
      [fast.id, detailFor(fast, 5, 240)],
      [slow.id, detailFor(slow, 5, 300)]
    ]);
    const records = await computeAllRecords([fast, slow], detailLookup(details));
    const r5k = records.find((r) => r.key === '5km')!;
    expect(r5k.setByActivityId).toBe(fast.id);
    expect(r5k.history).toHaveLength(1);
  });

  it('reads "longest" records straight from activity.distanceKm, no detail needed', async () => {
    const a = activity({ sport: 'running', date: '2024-01-01', distanceKm: 21.1 });
    const records = await computeAllRecords([a], async () => null);
    const longest = records.find((r) => r.key === 'longest-run')!;
    expect(longest.bestValue).toBeCloseTo(21.1, 5);
    expect(longest.setByActivityId).toBe(a.id);
  });

  it('reads "fastest-avg-speed" straight from activity.avgSpeedKmh', async () => {
    const a = activity({ sport: 'cycling', date: '2024-01-01', avgSpeedKmh: 32.5 });
    const records = await computeAllRecords([a], async () => null);
    const ride = records.find((r) => r.key === 'fastest-ride')!;
    expect(ride.bestValue).toBeCloseTo(32.5, 5);
  });

  it('only considers activities of the matching sport family', async () => {
    const ride = activity({ sport: 'cycling', date: '2024-01-01', distanceKm: 50 });
    const records = await computeAllRecords([ride], async () => null);
    const longestRun = records.find((r) => r.key === 'longest-run')!;
    expect(longestRun.bestValue).toBeNull();
  });
});

describe('currentRecordHolderIds', () => {
  it('collects every activity id that currently holds at least one record', async () => {
    const a = activity({ sport: 'running', date: '2024-01-01', distanceKm: 10 });
    const records = await computeAllRecords([a], async () => null);
    const ids = currentRecordHolderIds(records);
    expect(ids.has(a.id)).toBe(true);
  });

  it('excludes records nobody has set yet', () => {
    const ids = currentRecordHolderIds([
      { key: 'x', label: 'X', sport: 'running', kind: 'longest', bestValue: null, setDate: null, setByActivityId: null, previousValue: null, history: [] }
    ]);
    expect(ids.size).toBe(0);
  });
});

describe('milestoneLadders', () => {
  it('returns the top-N longest efforts per sport within the selected date range, longest first', () => {
    const acts = [
      activity({ sport: 'running', date: '2024-01-01', distanceKm: 5 }),
      activity({ sport: 'running', date: '2024-01-02', distanceKm: 21.1 }),
      activity({ sport: 'running', date: '2024-01-03', distanceKm: 10 }),
      activity({ sport: 'cycling', date: '2024-01-01', distanceKm: 80 })
    ];
    const [runLadder] = milestoneLadders(acts, ['running'], '2024-01-01', '2024-12-31', 2);
    expect(runLadder!.entries).toHaveLength(2);
    expect(runLadder!.entries[0]!.distanceKm).toBeCloseTo(21.1, 5);
    expect(runLadder!.entries[1]!.distanceKm).toBeCloseTo(10, 5);
  });

  it('excludes efforts outside the selected date range', () => {
    const old = activity({ sport: 'running', date: '2000-01-01', distanceKm: 42.2 });
    const [runLadder] = milestoneLadders([old], ['running'], '2023-01-01', '2024-12-31', 4);
    expect(runLadder!.entries).toHaveLength(0);
  });
});
