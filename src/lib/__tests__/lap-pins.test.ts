import { describe, it, expect } from 'vitest';
import type { Lap } from '../types';
import { lapPinFixes } from '../lap-pins';

function lap(index: number, distanceM: number): Lap {
  return { index, startOffsetSec: 0, elapsedSec: 0, distanceM, avgPaceMinPerKm: 0, avgHR: 0, maxHR: 0, avgCadence: 0 };
}

describe('lapPinFixes', () => {
  // distance stream in metres, one sample per second
  const distance = [0, 300, 600, 900, 1000, 1200, 1500, 1800, 2000];

  it('returns nothing without fixes or laps', () => {
    expect(lapPinFixes([], distance, [lap(0, 1000)])).toEqual([]);
    expect(lapPinFixes([0, 1, 2], distance, [])).toEqual([]);
  });

  it('places each pin on the first fix reaching the cumulative lap distance', () => {
    const fixes = distance.map((_, i) => i);
    expect(lapPinFixes(fixes, distance, [lap(0, 1000), lap(1, 1000)])).toEqual([
      { lapIndex: 0, fixIdx: 4 },
      { lapIndex: 1, fixIdx: 8 }
    ]);
  });

  it('maps through fix-to-stream indices when GPS fixes are sparse', () => {
    // fixes only at stream samples 0, 2, 5, 8
    expect(lapPinFixes([0, 2, 5, 8], distance, [lap(0, 1000)])).toEqual([{ lapIndex: 0, fixIdx: 2 }]);
  });

  it('clamps a final lap past the last fix onto the last fix', () => {
    const fixes = distance.map((_, i) => i);
    expect(lapPinFixes(fixes, distance, [lap(0, 1000), lap(1, 1050)])).toEqual([
      { lapIndex: 0, fixIdx: 4 },
      { lapIndex: 1, fixIdx: 8 }
    ]);
  });
});
