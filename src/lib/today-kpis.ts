// lib/today-kpis.ts
// The figures behind Today's KPI cards that aren't already in
// training-load.ts: the chronic-load ramp, VO2max rating bands, run volume
// split into bars, time trained by sport, and the time-in-zone split. Pure
// functions over the activity list, so the cards stay presentation only.

import type { Activity } from './types';
import { daysAgo, bucketIndexForDate, todayStr } from './date-utils';
import { sportFamily, type SportFamily } from './sport-color';

// ----- Chronic load ramp -----

// The commonly used ceiling for how fast weekly load should build.
export const SAFE_RAMP_PER_WEEK = 0.08;

export type RampStatus = 'steep' | 'building' | 'steady' | 'easing';

export interface ChronicRamp {
  changePct: number | null; // total change over `weeks`, null with no baseline
  perWeekPct: number | null; // the compound weekly rate behind it
  status: RampStatus;
}

/** How chronic load moved over the last `weeks` weeks of `series` (one
 *  value per week, oldest first). */
export function chronicRamp(series: number[], weeks = 4): ChronicRamp {
  const now = series[series.length - 1] ?? 0;
  const then = series[series.length - 1 - weeks] ?? 0;
  if (then <= 0) return { changePct: null, perWeekPct: null, status: now > 0 ? 'building' : 'steady' };
  const change = now / then - 1;
  const perWeek = Math.pow(now / then, 1 / weeks) - 1;
  const status: RampStatus = perWeek > SAFE_RAMP_PER_WEEK ? 'steep' : perWeek > 0.01 ? 'building' : perWeek < -0.01 ? 'easing' : 'steady';
  return { changePct: change * 100, perWeekPct: perWeek * 100, status };
}

// ----- VO2max rating bands -----

export type Sex = 'female' | 'male';
export type Vo2Band = 'poor' | 'fair' | 'good' | 'excellent' | 'superior';
export const VO2_BANDS: Vo2Band[] = ['poor', 'fair', 'good', 'excellent', 'superior'];

// Lower bounds (ml/kg/min) of Fair, Good, Excellent and Superior, by age
// group. The Cooper Institute norms as reproduced in Heyward, Advanced
// Fitness Assessment and Exercise Prescription; its "very poor" row is
// folded into Poor.
const NORMS: Record<Sex, { maxAge: number; bounds: [number, number, number, number] }[]> = {
  male: [
    { maxAge: 19, bounds: [38.4, 45.2, 51.0, 56.0] },
    { maxAge: 29, bounds: [36.5, 42.5, 46.5, 52.5] },
    { maxAge: 39, bounds: [35.5, 41.0, 45.0, 49.5] },
    { maxAge: 49, bounds: [33.6, 39.0, 43.8, 48.1] },
    { maxAge: 59, bounds: [31.0, 35.8, 41.0, 45.4] },
    { maxAge: Infinity, bounds: [26.1, 32.3, 36.5, 44.3] }
  ],
  female: [
    { maxAge: 19, bounds: [31.0, 35.0, 39.0, 42.0] },
    { maxAge: 29, bounds: [29.0, 33.0, 37.0, 41.1] },
    { maxAge: 39, bounds: [27.0, 31.5, 35.7, 40.1] },
    { maxAge: 49, bounds: [24.5, 29.0, 32.9, 37.0] },
    { maxAge: 59, bounds: [22.8, 27.0, 31.5, 35.8] },
    { maxAge: Infinity, bounds: [20.2, 24.5, 30.3, 31.5] }
  ]
};

export function vo2BandBounds(age: number, sex: Sex): [number, number, number, number] {
  return NORMS[sex].find((r) => age <= r.maxAge)!.bounds;
}

export function vo2Band(value: number, bounds: [number, number, number, number]): Vo2Band {
  let i = 0;
  while (i < bounds.length && value >= bounds[i]!) i++;
  return VO2_BANDS[i]!;
}

/** 0..1 position of `value` on a scale of five equal-width bands, linear
 *  within each band. The open-ended Poor and Superior bands are drawn as
 *  wide as the Fair..Excellent average. */
export function vo2ScalePosition(value: number, bounds: [number, number, number, number]): number {
  const span = (bounds[3] - bounds[0]) / 3;
  const edges = [bounds[0] - span, ...bounds, bounds[3] + span];
  const clamped = Math.min(edges[5]!, Math.max(edges[0]!, value));
  let i = 0;
  while (i < 4 && clamped >= edges[i + 1]!) i++;
  return (i + (clamped - edges[i]!) / (edges[i + 1]! - edges[i]!)) / 5;
}

// ----- Run volume bars -----

export type VolumeBucket = 'day' | 'week' | 'month';

export interface VolumeBar {
  km: number;
  label: string; // a month's initial; '' for days and weeks
  title: string; // what the bar covers, for its tooltip
  current: boolean; // the still-running period
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Bar granularity for a range of `days`: daily up to a month, weekly up
 *  to ~6 months, monthly beyond. */
export function volumeBucketFor(days: number): VolumeBucket {
  return days <= 31 ? 'day' : days <= 183 ? 'week' : 'month';
}

/** Running km over the last `days` days, split into bars. Days and weeks
 *  count back from today; months are calendar months, oldest first, ending
 *  with the current one. */
export function runVolumeBars(activities: Activity[], days: number): { bucket: VolumeBucket; bars: VolumeBar[] } {
  const bucket = volumeBucketFor(days);
  const runs = activities.filter((a) => sportFamily(a.sport) === 'running');
  if (bucket !== 'month') {
    const size = bucket === 'day' ? 1 : 7;
    const n = Math.max(1, Math.ceil(days / size));
    const km = new Array(n).fill(0) as number[];
    for (const a of runs) {
      const idx = bucketIndexForDate(a.date, n, size);
      if (idx !== null) km[idx]! += a.distanceKm;
    }
    const unit = bucket === 'day' ? 'day' : 'week';
    return {
      bucket,
      bars: km.map((v, i) => ({ km: v, label: '', title: i === n - 1 ? `this ${unit}` : `${n - 1 - i} ${unit}${n - 1 - i === 1 ? '' : 's'} ago`, current: i === n - 1 }))
    };
  }
  const today = todayStr();
  const [y, m] = today.split('-').map(Number) as [number, number];
  const n = Math.max(1, Math.round(days / 30.44));
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const km = new Map(keys.map((k) => [k, 0]));
  for (const a of runs) {
    const k = a.date.slice(0, 7);
    if (km.has(k) && daysAgo(a.date) >= 0) km.set(k, km.get(k)! + a.distanceKm);
  }
  return {
    bucket,
    bars: keys.map((k, i) => {
      const name = MONTH_NAMES[Number(k.slice(5)) - 1]!;
      return { km: km.get(k)!, label: name[0]!, title: `${name} ${k.slice(0, 4)}`, current: i === keys.length - 1 };
    })
  };
}

// ----- Time trained by sport -----

export interface SportTime {
  family: SportFamily;
  hours: number;
}

/** Hours per sport family over the last `days` days, most first. */
/** Hours per sport family across the given activities, biggest first. */
export function hoursBySport(activities: Activity[]): SportTime[] {
  const hours = new Map<SportFamily, number>();
  for (const a of activities) {
    const f = sportFamily(a.sport);
    hours.set(f, (hours.get(f) ?? 0) + a.durationMin / 60);
  }
  return [...hours].map(([family, h]) => ({ family, hours: h })).sort((a, b) => b.hours - a.hours);
}

export function timeBySport(activities: Activity[], days: number): SportTime[] {
  const hours = new Map<SportFamily, number>();
  for (const a of activities) {
    const age = daysAgo(a.date);
    if (age < 0 || age >= days) continue;
    const f = sportFamily(a.sport);
    hours.set(f, (hours.get(f) ?? 0) + a.durationMin / 60);
  }
  return [...hours].map(([family, h]) => ({ family, hours: h })).sort((a, b) => b.hours - a.hours);
}

// ----- Time in zone -----

/** Seconds in HR zones 1-5 over the days `fromDaysAgo` (inclusive) to
 *  `toDaysAgo` (exclusive) back from today. */
export function zoneSeconds(activities: Activity[], toDaysAgo: number, fromDaysAgo = 0): number[] {
  const totals = [0, 0, 0, 0, 0];
  for (const a of activities) {
    const age = daysAgo(a.date);
    if (age < fromDaysAgo || age >= toDaysAgo || a.timeInZoneSec.length !== 5) continue;
    for (let i = 0; i < 5; i++) totals[i]! += a.timeInZoneSec[i]!;
  }
  return totals;
}

/** Seconds in HR zones 1-5 per 7-day week, oldest first, the last week
 *  ending today - the same week buckets as the Training load chart. */
export function weeklyZoneSeconds(activities: Activity[], numWeeks: number): number[][] {
  const weeks = Array.from({ length: numWeeks }, () => [0, 0, 0, 0, 0]);
  for (const a of activities) {
    if (a.timeInZoneSec.length !== 5) continue;
    const idx = bucketIndexForDate(a.date, numWeeks, 7);
    if (idx === null) continue;
    for (let i = 0; i < 5; i++) weeks[idx]![i]! += a.timeInZoneSec[i]!;
  }
  return weeks;
}

// ----- Polarisation -----

export interface IntensityShare {
  key: 'easy' | 'moderate' | 'hard';
  pct: number; // share of time, 0-100
  target: number; // the polarised-training target, 0-100
  onTarget: boolean; // within ON_TARGET_PTS of it
}

// ~80% easy (Z1-2), ~5% moderate (Z3), ~15% hard (Z4-5).
export const POLARISED_TARGETS = { easy: 80, moderate: 5, hard: 15 };
export const ON_TARGET_PTS = 3;

export function intensityShares(zones: number[]): IntensityShare[] | null {
  const total = zones.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  const pct = (v: number) => (v / total) * 100;
  const parts: [IntensityShare['key'], number][] = [
    ['easy', pct(zones[0]! + zones[1]!)],
    ['moderate', pct(zones[2]!)],
    ['hard', pct(zones[3]! + zones[4]!)]
  ];
  return parts.map(([key, p]) => {
    const target = POLARISED_TARGETS[key];
    return { key, pct: p, target, onTarget: Math.abs(Math.round(p) - target) <= ON_TARGET_PTS };
  });
}
