import { describe, it, expect } from 'vitest';
import type { Activity } from '../types';
import { currentRecovery } from '../recovery';

let nextId = 1;

// Builds an activity that *ended* `hoursAgo` hours before "now" (durationMin
// stays 0, so the activity's end time is just its start time), so tests can
// control real elapsed time precisely without mocking Date.now().
function endedHoursAgo(hoursAgo: number, recoveryTimeHours: number, overrides: Partial<Activity> = {}): Activity {
  const end = new Date(Date.now() - hoursAgo * 3600000);
  const date = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  const startTimeLabel = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  return {
    id: nextId++,
    date,
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
    startTimeLabel,
    sweatLossMl: 0,
    recoveryHrBpm: 0,
    garminVo2Max: 0,
    recoveryTimeHours,
    poolLengthM: 0,
    ...overrides
  };
}

describe('currentRecovery', () => {
  it('returns null when no activity has ever reported a recovery-time estimate', () => {
    const status = currentRecovery([endedHoursAgo(2, 0)]);
    expect(status.hoursRemaining).toBeNull();
    expect(status.sourceActivityId).toBeNull();
  });

  it('counts down from a recent hard effort', () => {
    const a = endedHoursAgo(10, 73);
    const status = currentRecovery([a]);
    // 73h estimate, 10h elapsed -> ~63h remaining.
    expect(status.hoursRemaining).toBe(63);
    expect(status.sourceActivityId).toBe(a.id);
  });

  it('reports fully recovered (0h) once the estimate has fully elapsed, still attributing the source', () => {
    const a = endedHoursAgo(100, 20);
    const status = currentRecovery([a]);
    expect(status.hoursRemaining).toBe(0);
    expect(status.sourceActivityId).toBe(a.id);
  });

  it('picks the longer still-active recovery window, not just the most recent activity', () => {
    // A hard effort 24h ago with 73h of recovery (49h still remaining) should
    // win over an easy session 1h ago with only 5h of recovery (4h remaining) -
    // an easy day doesn't reset a harder day's still-running recovery debt.
    const hard = endedHoursAgo(24, 73);
    const easy = endedHoursAgo(1, 5);
    const status = currentRecovery([hard, easy]);
    expect(status.hoursRemaining).toBe(49);
    expect(status.sourceActivityId).toBe(hard.id);
  });

  it('ignores activities with no start time label (cannot reconstruct an end time)', () => {
    const a = endedHoursAgo(5, 40, { startTimeLabel: '' });
    const status = currentRecovery([a]);
    expect(status.hoursRemaining).toBeNull();
  });
});
