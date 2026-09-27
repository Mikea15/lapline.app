import { describe, it, expect } from 'vitest';
import { buildEffortColumns } from '../effort-tape';

const Z = [94, 113, 132, 150, 168]; // standard 5-zone floors used elsewhere in this app's tests

describe('buildEffortColumns', () => {
  it('returns one column per requested bucket', () => {
    const hr = new Array(100).fill(140);
    const pace = new Array(100).fill(6);
    expect(buildEffortColumns(hr, Z, pace, 10)).toHaveLength(10);
  });

  it('returns an empty array for no samples or zero columns', () => {
    expect(buildEffortColumns([], Z, [], 120)).toEqual([]);
    expect(buildEffortColumns([140], Z, [6], 0)).toEqual([]);
  });

  it('flags a column with no real HR samples as no-data (height/opacity 0)', () => {
    const hr = [0, 0, 0, 0, 0]; // e.g. before the device found a HR signal
    const pace = [6, 6, 6, 6, 6];
    const cols = buildEffortColumns(hr, Z, pace, 1);
    expect(cols[0]!.heightFrac).toBe(0);
    expect(cols[0]!.opacity).toBe(0);
    expect(cols[0]!.zone).toBe(-1);
  });

  it('normalises a higher mean HR to a taller, more opaque, hotter-zoned bar', () => {
    const easyHr = new Array(60).fill(125); // near the 120bpm floor
    const hardHr = new Array(60).fill(185); // near the 190bpm ceiling
    const pace = new Array(60).fill(5.5);
    const easyCol = buildEffortColumns(easyHr, Z, pace, 1)[0]!;
    const hardCol = buildEffortColumns(hardHr, Z, pace, 1)[0]!;
    expect(hardCol.heightFrac).toBeGreaterThan(easyCol.heightFrac);
    expect(hardCol.opacity).toBeGreaterThan(easyCol.opacity);
    expect(hardCol.zone).toBeGreaterThan(easyCol.zone);
  });

  it('computes each column\'s own mean pace, independent of its HR data', () => {
    const hr = [150, 150, 150, 150];
    const pace = [5, 6, 7, 8];
    const cols = buildEffortColumns(hr, Z, pace, 2);
    expect(cols[0]!.paceMinPerKm).toBeCloseTo(5.5, 6);
    expect(cols[1]!.paceMinPerKm).toBeCloseTo(7.5, 6);
  });

  it('reports a null pace for a column with no finite/positive pace samples', () => {
    const hr = [150, 150];
    const pace = [Infinity, NaN];
    const cols = buildEffortColumns(hr, Z, pace, 1);
    expect(cols[0]!.paceMinPerKm).toBeNull();
  });
});
