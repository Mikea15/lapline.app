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
