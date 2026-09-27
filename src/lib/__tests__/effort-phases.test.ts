import { describe, it, expect } from 'vitest';
import { segmentEffortPhases } from '../effort-phases';

// Synthetic 40-minute (2400s @ 1Hz) activity, built with four deliberate
// real phases so the segmentation's boundaries can be checked against known
// ground truth rather than just "it returns something":
//  0-300:    warm-up - HR ramps 110->150bpm, pace a flat 6:30/km
//  300-1500: steady  - HR flat 150bpm, pace flat 6:00/km
//  1500-2100: drift  - HR ramps 150->170bpm, pace stays flat 6:00/km
//  2100-2400: surge  - pace drops to 5:00/km (HR 175, irrelevant to surge detection)
const N = 2400;
const HR_ZONES = [100, 120, 140, 155, 168]; // Z3 (aerobic) floor = 140

function buildSynthetic() {
  const t: number[] = [];
  const hr: number[] = [];
  const pace: number[] = [];
  const distance: number[] = [];
  let cumDist = 0;
  for (let i = 0; i < N; i++) {
    t.push(i);
    if (i < 300) {
      hr.push(110 + i * (40 / 300));
      pace.push(6.5);
    } else if (i < 1500) {
      hr.push(150);
      pace.push(6.0);
    } else if (i < 2100) {
      hr.push(150 + (i - 1500) * (20 / 600));
      pace.push(6.0);
    } else {
      hr.push(175);
      pace.push(5.0);
    }
    // distance advances by real speed implied by this second's pace
    cumDist += 1000 / (pace[i]! * 60);
    distance.push(cumDist);
  }
  return { t, hr, pace, distance };
}

describe('segmentEffortPhases', () => {
  it('returns no phases for too-short activities', () => {
    expect(segmentEffortPhases([], [], [], [], HR_ZONES)).toEqual([]);
    const shortT = Array.from({ length: 200 }, (_, i) => i);
    const shortHr = shortT.map(() => 140);
    const shortPace = shortT.map(() => 6);
    const shortDist = shortT.map((i) => i * 3);
    expect(segmentEffortPhases(shortT, shortHr, shortPace, shortDist, HR_ZONES)).toEqual([]);
  });

  it('detects all four phases in the right order for a synthetic activity with all four', () => {
    const { t, hr, pace, distance } = buildSynthetic();
    const phases = segmentEffortPhases(t, hr, pace, distance, HR_ZONES);
    expect(phases.map((p) => p.kind)).toEqual(['warmup', 'steady', 'drift', 'surge']);
  });

  it('ends warm-up once HR sustainably crosses the aerobic zone floor, well within the first quarter', () => {
    const { t, hr, pace, distance } = buildSynthetic();
    const [warmup] = segmentEffortPhases(t, hr, pace, distance, HR_ZONES);
    expect(warmup!.kind).toBe('warmup');
    expect(warmup!.endSec).toBeGreaterThan(150);
    expect(warmup!.endSec).toBeLessThan(600); // first quarter of 2400s
    expect(warmup!.avgHR).toBeLessThan(150); // still ramping, below the steady plateau
  });

  it('flags cardiac drift as a real HR rise at a flat pace', () => {
    const { t, hr, pace, distance } = buildSynthetic();
    const phases = segmentEffortPhases(t, hr, pace, distance, HR_ZONES);
    const drift = phases.find((p) => p.kind === 'drift')!;
    const steady = phases.find((p) => p.kind === 'steady')!;
    expect(drift.deltaHR).toBeGreaterThanOrEqual(3);
    expect(drift.avgHR).toBeGreaterThan(steady.avgHR);
    expect(drift.paceTrend).toBe('flat');
  });

  it('detects the closing surge as measurably faster than the session average, with its own max HR', () => {
    const { t, hr, pace, distance } = buildSynthetic();
    const phases = segmentEffortPhases(t, hr, pace, distance, HR_ZONES);
    const surge = phases.find((p) => p.kind === 'surge')!;
    const steady = phases.find((p) => p.kind === 'steady')!;
    expect(surge.avgPaceMinPerKm).toBeLessThan(steady.avgPaceMinPerKm);
    expect(surge.maxHR).toBeGreaterThanOrEqual(170);
    expect(surge.startSec).toBeGreaterThan(2000);
  });

  it('reports a tight steady-state pace spread (real per-km consistency, not raw sensor noise)', () => {
    const { t, hr, pace, distance } = buildSynthetic();
    const steady = segmentEffortPhases(t, hr, pace, distance, HR_ZONES).find((p) => p.kind === 'steady')!;
    expect(steady.paceStdDevSec).toBeDefined();
    expect(steady.paceStdDevSec!).toBeLessThan(5);
    expect(steady.distanceKm).toBeGreaterThan(1);
  });

  it('omits the drift phase entirely when HR never rises within the middle window (no false positive)', () => {
    const flatN = 1200;
    const t = Array.from({ length: flatN }, (_, i) => i);
    const hr = t.map((i) => (i < 200 ? 110 + i * (40 / 200) : 150));
    const pace = t.map(() => 6.0);
    const distance = t.map((i) => i * 2.78);
    const phases = segmentEffortPhases(t, hr, pace, distance, HR_ZONES);
    expect(phases.some((p) => p.kind === 'drift')).toBe(false);
    expect(phases.some((p) => p.kind === 'steady')).toBe(true);
  });
});
