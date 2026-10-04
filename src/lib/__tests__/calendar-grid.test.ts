import { describe, it, expect } from 'vitest';
import { mondayIndex, monthGridWeeks, isInMonth, monthCompareWindow } from '../calendar-grid';

describe('mondayIndex', () => {
  it('is 0 for a Monday and 6 for a Sunday', () => {
    expect(mondayIndex('2026-09-07')).toBe(0); // a Monday
    expect(mondayIndex('2026-09-06')).toBe(6); // the Sunday before it
  });
});

describe('monthGridWeeks', () => {
  it('matches the design brief\'s own worked example for September 2026 (Mon 31 Aug -> Sun 4 Oct, 5 rows)', () => {
    const weeks = monthGridWeeks(2026, 9);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]![0]).toBe('2026-08-31');
    expect(weeks[4]![6]).toBe('2026-10-04');
  });

  it('every week is 7 days, Monday-start, with no gaps', () => {
    const weeks = monthGridWeeks(2026, 9);
    for (const week of weeks) {
      expect(week).toHaveLength(7);
      expect(mondayIndex(week[0]!)).toBe(0);
    }
    const flat = weeks.flat();
    for (let i = 1; i < flat.length; i++) {
      const prev = new Date(flat[i - 1]! + 'T00:00:00');
      const cur = new Date(flat[i]! + 'T00:00:00');
      expect((cur.getTime() - prev.getTime()) / 86400000).toBe(1);
    }
  });

  it('adds no leading/trailing days when the 1st is a Monday and the last day is a Sunday', () => {
    // February 2027: 1 Feb 2027 is a Monday, 28 Feb 2027 is a Sunday.
    const weeks = monthGridWeeks(2027, 2);
    expect(weeks[0]![0]).toBe('2027-02-01');
    expect(weeks[weeks.length - 1]![6]).toBe('2027-02-28');
  });

  it('covers every real day of the month', () => {
    const weeks = monthGridWeeks(2026, 4); // April: 30 days
    const inMonth = weeks.flat().filter((d) => isInMonth(d, 2026, 4));
    expect(inMonth).toHaveLength(30);
  });
});

describe('isInMonth', () => {
  it('matches only dates within the given year/month', () => {
    expect(isInMonth('2026-09-15', 2026, 9)).toBe(true);
    expect(isInMonth('2026-08-31', 2026, 9)).toBe(false);
    expect(isInMonth('2026-10-01', 2026, 9)).toBe(false);
  });
});

describe('monthCompareWindow', () => {
  it('compares the month in progress with the same days of last month', () => {
    expect(monthCompareWindow(2026, 10, '2026-10-03')).toEqual({
      prevStart: '2026-09-01',
      prevEnd: '2026-09-03',
      partial: true,
      label: '1–3 Sep'
    });
  });
  it('labels a single elapsed day without a range', () => {
    expect(monthCompareWindow(2026, 10, '2026-10-01')?.label).toBe('1 Sep');
  });
  it('clamps to the length of a shorter previous month', () => {
    const w = monthCompareWindow(2026, 3, '2026-03-31')!;
    expect(w.prevEnd).toBe('2026-02-28');
    expect(w.label).toBe('1–28 Feb');
  });
  it('wraps January back to December of the previous year', () => {
    expect(monthCompareWindow(2027, 1, '2027-01-10')?.prevStart).toBe('2026-12-01');
  });
  it('compares a finished month with the whole previous month', () => {
    expect(monthCompareWindow(2026, 9, '2026-10-03')).toEqual({
      prevStart: '2026-08-01',
      prevEnd: '2026-08-31',
      partial: false,
      label: 'Aug'
    });
  });
  it('is null for a month that has not started', () => {
    expect(monthCompareWindow(2026, 11, '2026-10-03')).toBeNull();
  });
});
