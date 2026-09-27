import { describe, it, expect } from 'vitest';
import { firstFix } from '../geo';

describe('firstFix', () => {
  it('returns the first fix where both lat and lon are present', () => {
    expect(firstFix([null, null, 51.5], [null, null, -0.1])).toEqual({ lat: 51.5, lon: -0.1 });
  });

  it('skips a fix where only one of lat/lon is present', () => {
    expect(firstFix([51.5, 51.6], [null, -0.1])).toEqual({ lat: 51.6, lon: -0.1 });
  });

  it('returns null when no fix has both coordinates (e.g. an indoor pool swim)', () => {
    expect(firstFix([null, null], [null, null])).toBeNull();
    expect(firstFix([], [])).toBeNull();
  });
});
