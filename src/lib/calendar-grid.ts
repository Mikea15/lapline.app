// lib/calendar-grid.ts
// Pure month-grid date math for the Calendar screen (design_handoff_calendar):
// Monday-start weeks that fully cover a calendar month, padded with the
// leading/trailing days of the adjacent months needed to complete the first
// and last week - always a whole number of 7-day weeks.

import { addDays, daysBetween } from './date-utils';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Monday-start day-of-week index for a "YYYY-MM-DD" string (0 = Monday, 6 = Sunday).
export function mondayIndex(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  return (d.getDay() + 6) % 7;
}

// `month` is 1-indexed (1 = January), matching the "YYYY-MM-DD" convention
// used everywhere else in this app.
export function monthGridWeeks(year: number, month: number): string[][] {
  const firstOfMonth = `${year}-${pad2(month)}-01`;
  const gridStart = addDays(firstOfMonth, -mondayIndex(firstOfMonth));

  const daysInMonth = new Date(year, month, 0).getDate();
  const lastOfMonth = `${year}-${pad2(month)}-${pad2(daysInMonth)}`;
  const gridEnd = addDays(lastOfMonth, 6 - mondayIndex(lastOfMonth));

  const totalDays = daysBetween(gridStart, gridEnd) + 1;
  const days: string[] = [];
  for (let i = 0; i < totalDays; i++) days.push(addDays(gridStart, i));

  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function isInMonth(dateStr: string, year: number, month: number): boolean {
  return dateStr.startsWith(`${year}-${pad2(month)}`);
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MonthCompareWindow {
  /** Inclusive date bounds of the previous-month slice to compare against. */
  prevStart: string;
  prevEnd: string;
  /** True when the viewed month is still in progress (month-to-date). */
  partial: boolean;
  /** Chip suffix after "vs ": "Sep" for a whole month, "1–3 Sep" for month-to-date. */
  label: string;
}

// What the previous month should be compared against. A finished month is
// compared with the whole previous month; the month in progress is compared
// month-to-date with the same days of last month (so 3 Oct is set against
// 1-3 Sep, not all of Sep). Null for a month that hasn't started yet.
export function monthCompareWindow(year: number, month: number, today: string): MonthCompareWindow | null {
  const key = `${year}-${pad2(month)}`;
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevKey = `${prevYear}-${pad2(prevMonth)}`;
  const prevDays = new Date(prevYear, prevMonth, 0).getDate();
  const prevName = SHORT_MONTHS[prevMonth - 1]!;

  if (`${key}-01` > today) return null;
  if (!today.startsWith(key)) {
    return { prevStart: `${prevKey}-01`, prevEnd: `${prevKey}-${pad2(prevDays)}`, partial: false, label: prevName };
  }
  const day = Number(today.slice(8, 10));
  const throughDay = Math.min(day, prevDays);
  return {
    prevStart: `${prevKey}-01`,
    prevEnd: `${prevKey}-${pad2(throughDay)}`,
    partial: true,
    label: throughDay === 1 ? `1 ${prevName}` : `1–${throughDay} ${prevName}`
  };
}
