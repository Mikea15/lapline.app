// lib/critical-pace.ts
// Best sustained pace per duration bucket ("critical pace curve"), the
// selected range against the equal-length range before it - backs the
// Records screen's curve.

import type { Activity, ActivityDetail } from './types';
import { sportFamily } from './sport-color';
import { bestDistanceForDuration } from './best-effort';
import { addDays, daysBetween } from './date-utils';

// 1 / 5 / 10 / 20 / 30 / 45 / 60 minutes, matching the design's non-linear x-axis.
export const CRITICAL_PACE_DURATIONS_SEC = [60, 300, 600, 1200, 1800, 2700, 3600];

export interface CriticalPacePoint {
  durationSec: number;
  paceMinPerKm: number | null;
}

async function curveForActivities(
  acts: Activity[],
  getDetail: (id: number) => Promise<ActivityDetail | null>
): Promise<CriticalPacePoint[]> {
  const runs = acts.filter((a) => sportFamily(a.sport) === 'running');
  const details = await Promise.all(runs.map((a) => getDetail(a.id)));
  return CRITICAL_PACE_DURATIONS_SEC.map((durationSec) => {
    let best: number | null = null;
    for (const d of details) {
      if (!d || d.distance.length < 2) continue;
      const meters = bestDistanceForDuration(d.distance, d.t, durationSec);
      if (meters && meters > 0) {
        const paceMinPerKm = durationSec / 60 / (meters / 1000);
        if (best === null || paceMinPerKm < best) best = paceMinPerKm;
      }
    }
    return { durationSec, paceMinPerKm: best };
  });
}

export interface CriticalPaceCurves {
  thisRange: CriticalPacePoint[];
  previousRange: CriticalPacePoint[];
}

// `startDate`/`endDate` = the header's selected range (arbitrary, not
// necessarily ending today); the previous range is the same-length window
// immediately before it.
export async function criticalPaceCurves(
  activities: Activity[],
  getDetail: (id: number) => Promise<ActivityDetail | null>,
  startDate: string,
  endDate: string
): Promise<CriticalPaceCurves> {
  const rangeDays = daysBetween(startDate, endDate) + 1;
  const prevEnd = addDays(startDate, -1);
  const prevStart = addDays(startDate, -rangeDays);
  const inRange = (d: string, s: string, e: string) => d >= s && d <= e;
  const thisRangeActs = activities.filter((a) => inRange(a.date, startDate, endDate));
  const prevRangeActs = activities.filter((a) => inRange(a.date, prevStart, prevEnd));
  const [thisRange, previousRange] = await Promise.all([
    curveForActivities(thisRangeActs, getDetail),
    curveForActivities(prevRangeActs, getDetail)
  ]);
  return { thisRange, previousRange };
}
