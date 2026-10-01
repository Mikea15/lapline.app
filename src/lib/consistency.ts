// lib/consistency.ts
// The figures behind Today's Consistency heatmap: each day's minutes and
// main sport (the cell's colour), how deep to shade it, streaks, and how
// often each weekday gets trained. Dates are local 'YYYY-MM-DD' strings.

import type { Activity } from './types';
import { addDays } from './date-utils';
import { sportFamily, type SportFamily } from './sport-color';

export interface DaySummary {
  minutes: number;
  family: SportFamily; // the sport with the most minutes that day
}

export function daySummaries(activities: Activity[]): Map<string, DaySummary> {
  const byDay = new Map<string, Map<SportFamily, number>>();
  for (const a of activities) {
    const fams = byDay.get(a.date) ?? new Map<SportFamily, number>();
    const f = sportFamily(a.sport);
    fams.set(f, (fams.get(f) ?? 0) + a.durationMin);
    byDay.set(a.date, fams);
  }
  const out = new Map<string, DaySummary>();
  for (const [date, fams] of byDay) {
    let minutes = 0;
    let family: SportFamily = 'other';
    let best = -1;
    for (const [f, m] of fams) {
      minutes += m;
      if (m > best) {
        best = m;
        family = f;
      }
    }
    if (minutes > 0) out.set(date, { minutes, family });
  }
  return out;
}

// Shade steps: under 30 min, under an hour, under two hours, two hours+.
export const DEPTH_LIMITS = [30, 60, 120];

export function depthLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  const i = DEPTH_LIMITS.findIndex((limit) => minutes < limit);
  return (i === -1 ? 4 : i + 1) as 1 | 2 | 3 | 4;
}

/** The longest run of consecutive trained days from `from` to `to`
 *  (inclusive). */
export function longestStreak(days: Map<string, DaySummary>, from: string, to: string): number {
  let best = 0;
  let run = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    run = days.has(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** For each weekday (0 = Monday), the share of weeks from the Monday
 *  `firstMonday` up to `today` in which that weekday was trained. A weekday
 *  still to come this week isn't counted against it. */
export function weekdayShare(days: Map<string, DaySummary>, firstMonday: string, today: string): number[] {
  const trained = new Array(7).fill(0) as number[];
  const seen = new Array(7).fill(0) as number[];
  for (let monday = firstMonday; monday <= today; monday = addDays(monday, 7)) {
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      if (d > today) break;
      seen[i]!++;
      if (days.has(d)) trained[i]!++;
    }
  }
  return trained.map((t, i) => (seen[i]! > 0 ? t / seen[i]! : 0));
}
