import { describe, it, expect } from 'vitest';
import { lengthIndexRange, lengthHrTrace, lengthZoneMix, lengthPaceSecPer100, lengthSwolf, buildLengthDisplayRows } from '../swim-length-detail';
import type { SwimLength } from '../types';

const HR_ZONES = [100, 120, 140, 155, 168];

function makeLength(overrides: Partial<SwimLength> = {}): SwimLength {
  return { index: 0, startOffsetSec: 0, elapsedSec: 30, active: true, strokeCount: 20, strokeRate: 40, stroke: 'freestyle', ...overrides };
}

describe('lengthIndexRange', () => {
  it('finds the [start,end) index window for a length', () => {
    const t = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const length = makeLength({ startOffsetSec: 2, elapsedSec: 4 });
    expect(lengthIndexRange(length, t)).toEqual([2, 6]);
  });

  it('clamps to the end of the stream for a length past its real data', () => {
    const t = [0, 1, 2];
    const length = makeLength({ startOffsetSec: 5, elapsedSec: 4 });
    expect(lengthIndexRange(length, t)).toEqual([3, 3]);
  });
});

describe('lengthHrTrace', () => {
  it('slices real HR samples to the length window, dropping zero/unrecorded readings', () => {
    const t = [0, 1, 2, 3, 4];
    const hr = [130, 0, 140, 150, 999];
    const length = makeLength({ startOffsetSec: 0, elapsedSec: 4 });
    expect(lengthHrTrace(length, t, hr)).toEqual([130, 140, 150]);
  });
});

describe('lengthZoneMix', () => {
  it('returns the real fraction of length time in each zone, summing to 1', () => {
    const t = [0, 1, 2, 3];
    const hr = [130, 130, 145, 145];
    const length = makeLength({ startOffsetSec: 0, elapsedSec: 4 });
    const mix = lengthZoneMix(length, t, hr, HR_ZONES);
    expect(mix).toHaveLength(5);
    expect(mix.reduce((s, v) => s + v, 0)).toBeCloseTo(1);
    expect(mix[1]).toBeCloseTo(0.5);
    expect(mix[2]).toBeCloseTo(0.5);
  });

  it('returns [] with no zone config or no usable HR samples', () => {
    const t = [0, 1];
    const hr = [0, 0];
    const length = makeLength({ startOffsetSec: 0, elapsedSec: 2 });
    expect(lengthZoneMix(length, t, hr, HR_ZONES)).toEqual([]);
    expect(lengthZoneMix(length, t, [130, 140], [])).toEqual([]);
  });
});

describe('lengthPaceSecPer100', () => {
  it('computes real seconds/100m for an active length', () => {
    // 25m pool, 30s for the length -> 120s/100m
    const length = makeLength({ elapsedSec: 30 });
    expect(lengthPaceSecPer100(length, 25)).toBeCloseTo(120);
  });

  it('returns null for a rest length, zero pool length, or zero elapsed time', () => {
    expect(lengthPaceSecPer100(makeLength({ active: false }), 25)).toBeNull();
    expect(lengthPaceSecPer100(makeLength(), 0)).toBeNull();
    expect(lengthPaceSecPer100(makeLength({ elapsedSec: 0 }), 25)).toBeNull();
  });
});

describe('lengthSwolf', () => {
  it('computes real elapsed-seconds-plus-strokes for an active length', () => {
    const length = makeLength({ elapsedSec: 28.4, strokeCount: 18 });
    expect(lengthSwolf(length)).toBe(28 + 18); // Math.round(28.4) + 18
  });

  it('returns null for a rest length or one with no stroke count', () => {
    expect(lengthSwolf(makeLength({ active: false }))).toBeNull();
    expect(lengthSwolf(makeLength({ strokeCount: 0 }))).toBeNull();
  });
});

describe('buildLengthDisplayRows', () => {
  it('keeps active lengths as their own row and merges consecutive rest lengths into one', () => {
    const lengths: SwimLength[] = [
      makeLength({ index: 0, active: true, elapsedSec: 30 }),
      makeLength({ index: 1, active: false, elapsedSec: 10 }),
      makeLength({ index: 2, active: false, elapsedSec: 5 }),
      makeLength({ index: 3, active: false, elapsedSec: 8 }),
      makeLength({ index: 4, active: true, elapsedSec: 32 }),
      makeLength({ index: 5, active: true, elapsedSec: 31 }),
      makeLength({ index: 6, active: false, elapsedSec: 15 })
    ];
    const rows = buildLengthDisplayRows(lengths);
    expect(rows.map((r) => r.kind)).toEqual(['active', 'rest', 'active', 'active', 'rest']);
    const merged = rows[1];
    expect(merged).toMatchObject({ kind: 'rest', firstIndex: 1, lastIndex: 3, elapsedSec: 23 });
    const lastRest = rows[4];
    expect(lastRest).toMatchObject({ kind: 'rest', firstIndex: 6, lastIndex: 6, elapsedSec: 15 });
  });
});
