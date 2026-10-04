// lib/activity-efforts.ts
// A small per-activity summary of the best-effort searches the whole-history
// screens need, computed once from an activity's distance/time streams and
// stored (db.ts v8, `activityEfforts`), so Records, the Trends pace
// histogram and critical pace curve, and Today's VO2max read a few dozen
// numbers per activity instead of every recorded second of it.
//
// Holds exactly what best-effort.ts returns for the same streams and the
// same GPS-spike limit: each screen looks up the distance or duration it
// used to ask best-effort.ts for, so nothing it shows changes.

import type { Activity } from './types';
import { bestDistanceForDuration, bestTimeForDistance, kmSplitPaces, maxPlausibleSpeedMps, plausibleDistance } from './best-effort';

// Every distance (m) a screen asks the fastest time for: the 100 m swim and
// the 1/5/10 km run records.
export const EFFORT_DISTANCES_M = [100, 1000, 5000, 10000] as const;
// Every duration (s) a screen asks the farthest distance for: the critical
// pace curve (1-60 min), VO2max's candidate efforts (5-90 min) and the
// best-60-min record.
export const EFFORT_DURATIONS_SEC = [60, 300, 600, 900, 1200, 1800, 2700, 3600, 5400] as const;

// Bump when what's stored changes (a distance or duration added above, a
// fix in best-effort.ts): older rows are then recomputed from the records,
// on demand and in the background, the same way as after the v8 upgrade.
export const EFFORTS_VERSION = 1;

export interface ActivityEfforts {
  activityId: number;
  version: number;
  /** The GPS-spike limit the streams were cleaned with (maxPlausibleSpeedMps of the sport at the time). */
  maxSpeedMps: number;
  /** Fastest time (s) per EFFORT_DISTANCES_M entry, same order; null = never covered. */
  bestTimeSec: (number | null)[];
  /** Farthest distance (m) per EFFORT_DURATIONS_SEC entry, same order; null = shorter than that. */
  bestDistanceM: (number | null)[];
  /** kmSplitPaces() over the whole activity (min/km per full km). */
  kmSplitPaces: number[];
}

export type GetEfforts = (activity: Activity) => Promise<ActivityEfforts | null>;

export function computeActivityEfforts(activityId: number, sport: string, distance: number[], t: number[]): ActivityEfforts {
  const maxSpeedMps = maxPlausibleSpeedMps(sport);
  // Cleaned once here rather than once per search: each search would run
  // the same plausibleDistance() pass, and a cleaned stream passes through
  // it unchanged.
  const clean = plausibleDistance(distance, t, maxSpeedMps);
  return {
    activityId,
    version: EFFORTS_VERSION,
    maxSpeedMps,
    bestTimeSec: EFFORT_DISTANCES_M.map((m) => bestTimeForDistance(clean, t, m)),
    bestDistanceM: EFFORT_DURATIONS_SEC.map((s) => bestDistanceForDuration(clean, t, s)),
    kmSplitPaces: kmSplitPaces(clean, t)
  };
}

/** Whether a stored row still answers for this activity as it is now. */
export function effortsAreCurrent(e: ActivityEfforts, activity: Activity): boolean {
  return e.version === EFFORTS_VERSION && e.maxSpeedMps === maxPlausibleSpeedMps(activity.sport);
}

// Both throw for a distance/duration that isn't stored: asking for one is a
// bug (add it to the list and bump EFFORTS_VERSION), not missing data.
export function effortTimeForDistance(e: ActivityEfforts, targetM: number): number | null {
  const i = (EFFORT_DISTANCES_M as readonly number[]).indexOf(targetM);
  if (i < 0) throw new Error(`activity-efforts: ${targetM} m is not in EFFORT_DISTANCES_M`);
  return e.bestTimeSec[i] ?? null;
}

export function effortDistanceForDuration(e: ActivityEfforts, durationSec: number): number | null {
  const i = (EFFORT_DURATIONS_SEC as readonly number[]).indexOf(durationSec);
  if (i < 0) throw new Error(`activity-efforts: ${durationSec} s is not in EFFORT_DURATIONS_SEC`);
  return e.bestDistanceM[i] ?? null;
}
