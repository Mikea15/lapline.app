import { describe, it, expect } from 'vitest';
import { formatPace, formatPoolDistance, poolMeters, formatElevationRange } from '../units';

describe('formatPace', () => {
  it('formats a clean minute:second pace', () => {
    expect(formatPace(5.5, 'metric')).toBe('5:30 /km');
  });

  it('carries a seconds value that rounds up to 60 into the next minute', () => {
    // 5 + 59.7/60 minutes -> naively floor(5) + round(59.7) = "5:60"
    // instead of the correct "6:00".
    expect(formatPace(5 + 59.7 / 60, 'metric')).toBe('6:00 /km');
  });

  it('converts to imperial pace per mile', () => {
    expect(formatPace(5, 'imperial')).toBe('8:03 /mi');
  });
});

describe('formatPoolDistance', () => {
  it('shows pool swims in whole metres', () => {
    expect(formatPoolDistance(1.5)).toBe('1500 m');
    expect(formatPoolDistance(0.4753)).toBe('475 m');
    expect(poolMeters(0.0004)).toBe(0);
  });
});

describe('formatElevationRange', () => {
  it('uses a real minus sign and "to"', () => {
    expect(formatElevationRange(-6, 140, 'metric')).toBe('−6 to 140 m');
  });
  it('converts to feet for imperial', () => {
    expect(formatElevationRange(0, 100, 'imperial')).toBe('0 to 328 ft');
  });
});
