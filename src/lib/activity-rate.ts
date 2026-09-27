// lib/activity-rate.ts
// The Activity Ledger's per-sport "rate" column - and the Activities list's
// sort-by-rate - has a different meaning and unit per sport family: running
// -> pace (min/km, lower is faster), cycling -> average speed (km/h, higher
// is faster), pool swim -> pace per 100m (sec/100m, lower is faster),
// cardio/other -> max HR (bpm, no faster/slower sense at all). rateSortValue
// returns the same underlying number the ledger formats into that column's
// display string, so sorting by "Rate" sorts each row by whatever number is
// actually shown - it does not attempt to make different sports' rates
// comparable to each other, since the units genuinely differ.
import type { Activity } from './types';
import { sportFamily } from './sport-color';

export type ActivitySortKey = 'date' | 'time' | 'distance' | 'pace';

export function rateSortValue(a: Activity): number | null {
  const family = sportFamily(a.sport);
  if (family === 'running') {
    return a.distanceKm > 0.05 ? a.durationMin / a.distanceKm : null;
  }
  if (family === 'cycling') {
    return a.avgSpeedKmh > 0 ? a.avgSpeedKmh : null;
  }
  if (family === 'pool-swim') {
    if (a.distanceKm <= 0) return null;
    // Real moving-average pace (active swim time only, excluding every
    // real rest/idle length) rather than the elapsed session average -
    // per your call on the "length by length" tile grid's pace-vs-average
    // mismatch (bug-list.md): resting time inflating the denominator made
    // every real length read as unrealistically "faster" than this same
    // average. Falls back to the old elapsed-including-rest calculation
    // for a pool swim imported before swimActiveDurationMin existed, until
    // a re-parse backfills it - same contract as this app's other optional
    // backfilled fields.
    const activeMin = a.swimActiveDurationMin ?? a.durationMin;
    return activeMin > 0 ? (activeMin * 60) / ((a.distanceKm * 1000) / 100) : null;
  }
  return a.maxHR > 0 ? a.maxHR : null;
}

// Sort-value lookup for the Activities list's four sortable columns. Nulls
// (the value isn't meaningful for this row - e.g. no distance on a cardio
// session, or "rate" for a sport with no pace/speed/HR recorded) always
// sort to the end regardless of direction; the caller's comparator is
// responsible for that placement, not this function.
export function activitySortValue(a: Activity, key: ActivitySortKey): number | null {
  if (key === 'date') return Date.parse(a.date);
  if (key === 'time') return a.durationMin > 0 ? a.durationMin : null;
  if (key === 'distance') return a.distanceKm > 0 ? a.distanceKm : null;
  return rateSortValue(a);
}
