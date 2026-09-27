import { describe, it, expect } from 'vitest';
import { formatPace } from '../units';

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
