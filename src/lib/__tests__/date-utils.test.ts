import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dateToStr, todayStr, addDays, daysBetween } from '../date-utils';

describe('dateToStr', () => {
  const originalTZ = process.env.TZ;

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it('reads the local date, not the UTC date, at local midnight in a positive-UTC-offset timezone', () => {
    // Australia/Sydney is UTC+10/+11 - local midnight there is still the
    // previous day in UTC, which is exactly the case a naive
    // `d.toISOString().split('T')[0]` gets wrong.
    process.env.TZ = 'Australia/Sydney';
    const localMidnight = new Date(2026, 0, 5, 0, 0, 0); // Jan 5, local midnight
    expect(dateToStr(localMidnight)).toBe('2026-01-05');
  });

  it('agrees with the local date in a negative-UTC-offset timezone too', () => {
    process.env.TZ = 'America/Los_Angeles'; // UTC-8/-7
    const localMidnight = new Date(2026, 0, 5, 0, 0, 0);
    expect(dateToStr(localMidnight)).toBe('2026-01-05');
  });
});

describe('todayStr / addDays / daysBetween', () => {
  it('addDays rolls across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('daysBetween counts whole days regardless of order', () => {
    expect(daysBetween('2026-01-01', '2026-01-10')).toBe(9);
    expect(daysBetween('2026-01-10', '2026-01-01')).toBe(-9);
  });

  it('todayStr round-trips through addDays(0)', () => {
    expect(addDays(todayStr(), 0)).toBe(todayStr());
  });
});
