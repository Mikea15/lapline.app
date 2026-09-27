import { describe, it, expect } from 'vitest';
import { lapIndexRange, lapHrTrace, lapZoneMix } from '../lap-detail';
import type { Lap } from '../types';

const HR_ZONES = [100, 120, 140, 155, 168];

function makeLap(overrides: Partial<Lap> = {}): Lap {
  return { index: 0, startOffsetSec: 0, elapsedSec: 10, distanceM: 1000, avgPaceMinPerKm: 6, avgHR: 140, maxHR: 150, avgCadence: 170, ...overrides };
}

describe('lapIndexRange', () => {
  it('finds the [start,end) index window for a lap', () => {
    const t = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const lap = makeLap({ startOffsetSec: 2, elapsedSec: 4 }); // covers seconds [2,6)
    expect(lapIndexRange(lap, t)).toEqual([2, 6]);
  });

  it('clamps to the end of the stream for a lap past its real data', () => {
    const t = [0, 1, 2];
    const lap = makeLap({ startOffsetSec: 5, elapsedSec: 4 });
    expect(lapIndexRange(lap, t)).toEqual([3, 3]);
  });
});

describe('lapHrTrace', () => {
  it('slices real HR samples to the lap window, dropping zero/unrecorded readings', () => {
    const t = [0, 1, 2, 3, 4];
    const hr = [130, 0, 140, 150, 999];
    const lap = makeLap({ startOffsetSec: 0, elapsedSec: 4 }); // [0,4)
    expect(lapHrTrace(lap, t, hr)).toEqual([130, 140, 150]);
  });
});

describe('lapZoneMix', () => {
  it('returns the real fraction of lap time in each zone, summing to 1', () => {
    const t = [0, 1, 2, 3];
    const hr = [130, 130, 145, 145]; // 2x zone 1 (100-119 is z0... wait using HR_ZONES floors)
    const lap = makeLap({ startOffsetSec: 0, elapsedSec: 4 });
    const mix = lapZoneMix(lap, t, hr, HR_ZONES);
    expect(mix).toHaveLength(5);
    expect(mix.reduce((s, v) => s + v, 0)).toBeCloseTo(1);
    // 130bpm -> zone index 1 (floor 120), 145bpm -> zone index 2 (floor 140)
    expect(mix[1]).toBeCloseTo(0.5);
    expect(mix[2]).toBeCloseTo(0.5);
  });

  it('returns [] with no zone config or no usable HR samples', () => {
    const t = [0, 1];
    const hr = [0, 0];
    const lap = makeLap({ startOffsetSec: 0, elapsedSec: 2 });
    expect(lapZoneMix(lap, t, hr, HR_ZONES)).toEqual([]);
    expect(lapZoneMix(lap, t, [130, 140], [])).toEqual([]);
  });
});
