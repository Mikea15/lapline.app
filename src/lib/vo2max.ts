// lib/vo2max.ts
// VO2max estimate from real running performance, via the Daniels-Gilbert
// VDOT formula (Jack Daniels' Running Formula, 3rd ed.) - a published,
// widely-used method for estimating aerobic capacity from a single hard
// timed effort. This app has no access to Garmin/Firstbeat's proprietary
// on-device estimate (that comes from a separate wellness data stream this
// app doesn't import), but VDOT only needs a distance and a duration, both
// of which are real numbers already in every activity's stream.
//
// VDOT solves for the VO2max that makes a performance's velocity and
// duration consistent with two curve fits from Daniels' original research:
//  - VO2 cost of running at velocity v (m/min):    vo2(v)  = -4.60 + 0.182258v + 0.000104v^2
//  - %VO2max sustainable for duration t (minutes): pct(t)  = 0.8 + 0.1894393e^(-0.012778t) + 0.2989558e^(-0.1932605t)
//  - VDOT = vo2(v) / pct(t)
// The formula is only reliable for a hard, sustained (near-race) effort of
// roughly 3.5-90 minutes - outside that band it systematically over/under
// estimates. Feeding it a runner's single best qualifying effort within a
// window (the same sliding-window search the Records screen uses) is the
// closest this app can get to "a timed hard effort" from ordinary training data.

import type { Activity, ActivityDetail } from './types';
import { sportFamily } from './sport-color';
import { bestDistanceForDuration } from './best-effort';
import { daysAgo } from './date-utils';

const MIN_EFFORT_SEC = 210; // 3.5 min
const MAX_EFFORT_SEC = 5400; // 90 min

const CANDIDATE_DURATIONS_SEC = [300, 600, 900, 1200, 1800, 2700, 3600, 5400].filter(
  (s) => s >= MIN_EFFORT_SEC && s <= MAX_EFFORT_SEC
);

function vo2Cost(velocityMPerMin: number): number {
  return -4.6 + 0.182258 * velocityMPerMin + 0.000104 * velocityMPerMin ** 2;
}

function percentVO2Max(durationMin: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * durationMin) + 0.2989558 * Math.exp(-0.1932605 * durationMin);
}

function vdotFromEffort(distanceM: number, durationSec: number): number {
  const velocity = distanceM / (durationSec / 60);
  return vo2Cost(velocity) / percentVO2Max(durationSec / 60);
}

// Highest VDOT (i.e. best-equivalent effort) found across all candidate
// durations within one activity's stream.
function bestVdotInActivity(detail: ActivityDetail): number | null {
  if (detail.distance.length < 2) return null;
  let best: number | null = null;
  for (const durationSec of CANDIDATE_DURATIONS_SEC) {
    const meters = bestDistanceForDuration(detail.distance, detail.t, durationSec);
    if (!meters || meters <= 0) continue;
    const vdot = vdotFromEffort(meters, durationSec);
    if (vdot > 0 && (best === null || vdot > best)) best = vdot;
  }
  return best;
}

export interface Vo2MaxEstimate {
  value: number | null; // ml/kg/min, rounded to 1dp; null if no qualifying effort exists
  activityId: number | null;
  date: string | null;
}

// The runner's single best qualifying effort across all real running
// activities to date - the current VO2max estimate shown on Today.
export async function currentVo2Max(
  activities: Activity[],
  getDetail: (id: number) => Promise<ActivityDetail | null>
): Promise<Vo2MaxEstimate> {
  const runs = activities.filter((a) => sportFamily(a.sport) === 'running' && a.distanceKm > 0);
  let best: number | null = null;
  let bestId: number | null = null;
  let bestDate: string | null = null;
  for (const a of runs) {
    const detail = await getDetail(a.id);
    if (!detail) continue;
    const vdot = bestVdotInActivity(detail);
    if (vdot !== null && (best === null || vdot > best)) {
      best = vdot;
      bestId = a.id;
      bestDate = a.date;
    }
  }
  return { value: best !== null ? Math.round(best * 10) / 10 : null, activityId: bestId, date: bestDate };
}

const TREND_WINDOW_DAYS = 90;

// Weekly trend (oldest -> newest): the best qualifying effort found within a
// trailing 90-day window ending each week, so the series can rise or fall
// with real recent fitness rather than only ratchet upward like a PR table.
export async function weeklyVo2MaxTrend(
  activities: Activity[],
  getDetail: (id: number) => Promise<ActivityDetail | null>,
  numWeeks: number
): Promise<(number | null)[]> {
  const runs = activities.filter((a) => sportFamily(a.sport) === 'running' && a.distanceKm > 0);
  const withVdot = (
    await Promise.all(
      runs.map(async (a) => {
        const detail = await getDetail(a.id);
        return { daysAgo: daysAgo(a.date), vdot: detail ? bestVdotInActivity(detail) : null };
      })
    )
  ).filter((r): r is { daysAgo: number; vdot: number } => r.vdot !== null && r.daysAgo >= 0);

  const result: (number | null)[] = [];
  for (let i = 0; i < numWeeks; i++) {
    const asOfDaysAgo = (numWeeks - 1 - i) * 7;
    let windowMax: number | null = null;
    for (const r of withVdot) {
      if (r.daysAgo < asOfDaysAgo || r.daysAgo >= asOfDaysAgo + TREND_WINDOW_DAYS) continue;
      if (windowMax === null || r.vdot > windowMax) windowMax = r.vdot;
    }
    result.push(windowMax !== null ? Math.round(windowMax * 10) / 10 : null);
  }
  return result;
}
