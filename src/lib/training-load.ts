// lib/training-load.ts
// Weekly training load (arbitrary "au" units) and the acute:chronic ratio
// used by Today's KPI strip, the Training Load chart and the Physiology
// panel. Formula and windows are the design handoff's:
// load = run_h*68 + bike_h*38 + swim_h*44 (other sports don't contribute -
// the handoff's model is built for a run/bike/swim athlete); acute = 7d,
// chronic = 42d.

import type { Activity } from './types';
import { daysAgo, bucketIndexForDate } from './date-utils';
import { sportFamily } from './sport-color';

const LOAD_PER_HOUR: Record<string, number> = {
  running: 68,
  cycling: 38,
  'pool-swim': 44
};

// Exported so per-day/per-activity load (e.g. the Calendar screen's day-cell
// and week-rollup "au" figures) uses the exact same formula as every
// weekly/acute/chronic aggregate below, rather than a second copy that could
// drift from it.
export function activityLoad(a: Activity): number {
  const perHour = LOAD_PER_HOUR[sportFamily(a.sport)];
  if (!perHour) return 0;
  return (a.durationMin / 60) * perHour;
}

export interface WeeklyLoad {
  load: number;
  isCurrent: boolean; // the trailing 0-6-days-ago bucket, i.e. "this week" (likely incomplete)
}

// `numWeeks` trailing 7-day buckets ending today, oldest first.
export function weeklyLoadBuckets(activities: Activity[], numWeeks: number): WeeklyLoad[] {
  const loads = new Array(numWeeks).fill(0) as number[];
  for (const a of activities) {
    const idx = bucketIndexForDate(a.date, numWeeks, 7);
    if (idx !== null) loads[idx]! += activityLoad(a);
  }
  return loads.map((load, i) => ({ load, isCurrent: i === numWeeks - 1 }));
}

// Trailing `windowWeeks`-wide mean at each week index (for the smoothed
// chronic line drawn over the same weekly bars) - each point only averages
// over the weeks actually available before it, so the line is defined from
// week 1 rather than needing a windowWeeks-long runway of zeros first.
export function trailingMean(weeklyLoads: number[], windowWeeks: number): number[] {
  return weeklyLoads.map((_, i) => {
    const start = Math.max(0, i - windowWeeks + 1);
    const slice = weeklyLoads.slice(start, i + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

// The acute:chronic ratio's bands - one set of names everywhere (Training
// load panel, its chart, the Recovery card).
export type LoadBand = 'detrain' | 'productive' | 'caution' | 'risk';

export function loadBand(ratio: number): LoadBand {
  if (ratio < 0.8) return 'detrain';
  if (ratio <= 1.3) return 'productive';
  if (ratio <= 1.5) return 'caution';
  return 'risk';
}

export const LOAD_BAND_LABEL: Record<LoadBand, string> = {
  detrain: 'Detrain',
  productive: 'Productive',
  caution: 'Caution',
  risk: 'Risk'
};

export const LOAD_BAND_COLOR: Record<LoadBand, string> = {
  detrain: 'var(--zone-1)',
  productive: 'var(--positive)',
  caution: 'var(--caution)',
  risk: 'var(--alert)'
};

// Same bands as text (the fills above miss 4.5:1 as text in the light theme).
export const LOAD_BAND_INK: Record<LoadBand, string> = {
  detrain: 'var(--zone-1-ink)',
  productive: 'var(--positive-ink)',
  caution: 'var(--caution-ink)',
  risk: 'var(--alert-ink)'
};

// How much history the ratio needs before it means anything: 4 weeks, the
// same span the Chronic load card needs for its 4-week trend (its baseline
// week must hold training). Both cards read this one rule.
export const MIN_HISTORY_DAYS = 28;

// Days from the first load-bearing activity to today (0 with none).
export function loadHistoryDays(activities: Activity[]): number {
  let oldest = 0;
  for (const a of activities) {
    if (activityLoad(a) <= 0) continue;
    oldest = Math.max(oldest, daysAgo(a.date));
  }
  return oldest;
}

export interface AcuteChronic {
  acute7d: number;
  chronic42d: number; // mean weekly load over the trailing 42 days
  ratio: number; // 0 when chronic42d is 0 (no history yet)
  band: LoadBand;
  historyDays: number; // first load-bearing activity to today
  hasHistory: boolean; // historyDays >= MIN_HISTORY_DAYS; below it the ratio is only noise
}

export function acuteChronicRatio(activities: Activity[]): AcuteChronic {
  let acute7d = 0;
  let sum42d = 0;
  for (const a of activities) {
    const age = daysAgo(a.date);
    if (age < 0) continue;
    const load = activityLoad(a);
    if (age < 7) acute7d += load;
    if (age < 42) sum42d += load;
  }
  const chronic42d = sum42d / 6; // 42 days = 6 weeks
  const ratio = chronic42d > 0 ? acute7d / chronic42d : 0;
  const historyDays = loadHistoryDays(activities);
  return { acute7d, chronic42d, ratio, band: loadBand(ratio), historyDays, hasHistory: historyDays >= MIN_HISTORY_DAYS };
}

// Real run distance in the trailing `days` window, for the "Run volume" KPI.
export function runVolumeKm(activities: Activity[], days: number): number {
  return activities
    .filter((a) => sportFamily(a.sport) === 'running' && daysAgo(a.date) < days && daysAgo(a.date) >= 0)
    .reduce((s, a) => s + a.distanceKm, 0);
}
