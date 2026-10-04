// lib/efforts-store.ts
// Reads and fills db.activityEfforts (lib/activity-efforts.ts): the
// whole-history screens ask for one activity's efforts at a time, served
// from an in-memory copy of the table (a few dozen numbers per activity),
// and computed from the activity's records only when its row is missing or
// out of date - after the v8 upgrade, until the background backfill below
// has reached it, or after EFFORTS_VERSION is bumped.

import { db } from './db';
import { effortsFill, FILL_TICK_MS } from './efforts-progress.svelte';
import { computeActivityEfforts, effortsAreCurrent, type ActivityEfforts } from './activity-efforts';
import type { Activity, ParsedActivity } from './types';

let rowsPromise: Promise<Map<number, ActivityEfforts>> | null = null;
const computing = new Map<number, Promise<ActivityEfforts>>();
let backfillGeneration = 0;

function rows(): Promise<Map<number, ActivityEfforts>> {
  rowsPromise ??= db.activityEfforts.toArray().then((all) => new Map(all.map((e) => [e.activityId, e])));
  return rowsPromise;
}

// Forget the in-memory copy, so the next read comes from the database.
// activitiesStore.load() calls it: everything that rewrites records
// (import, re-parse, removing the samples, reset) reloads the activity list
// afterwards.
export function invalidateEfforts(): void {
  rowsPromise = null;
}

// Reads the records and writes the row in one transaction, so it can't
// interleave with a re-parse rewriting the same activity (saveActivities
// writes records and efforts together, in a transaction over both tables).
async function computeFromRecords(activity: Activity): Promise<ActivityEfforts> {
  return db.transaction('rw', [db.activityRecords, db.activityEfforts], async () => {
    const records = await db.activityRecords.where('activityId').equals(activity.id).toArray();
    const efforts = computeActivityEfforts(
      activity.id,
      activity.sport,
      records.map((r) => r.distance),
      records.map((r) => r.t)
    );
    await db.activityEfforts.put(efforts);
    return efforts;
  });
}

export async function getEfforts(activity: Activity): Promise<ActivityEfforts> {
  const map = await rows();
  const stored = map.get(activity.id);
  if (stored && effortsAreCurrent(stored, activity)) return stored;
  let pending = computing.get(activity.id);
  if (!pending) {
    pending = computeFromRecords(activity)
      .then((e) => {
        map.set(activity.id, e);
        return e;
      })
      .finally(() => computing.delete(activity.id));
    computing.set(activity.id, pending);
  }
  return pending;
}

// The row saveActivities() writes alongside a freshly parsed activity's
// records - from the parsed records themselves, before they're stored.
export function effortsForParsed(activityId: number, pa: ParsedActivity): ActivityEfforts {
  return computeActivityEfforts(
    activityId,
    pa.activity.sport,
    pa.records.map((r) => r.distance),
    pa.records.map((r) => r.t)
  );
}

// What the whole-history screens read: a stored, current row, or - while
// the background fill below is running - null for one it hasn't reached yet
// (computing those on demand would make every screen wait for the whole
// fill). With no fill running, the same as getEfforts.
export async function getEffortsForView(activity: Activity): Promise<ActivityEfforts | null> {
  if (!effortsFill.running) return getEfforts(activity);
  const stored = (await rows()).get(activity.id);
  return stored && effortsAreCurrent(stored, activity) ? stored : null;
}

// getEffortsForView that also counts the rows it had to leave out, so a
// screen can tell "the fill hasn't reached this yet" from "no data".
export function trackedEffortsForView(): { get: (a: Activity) => Promise<ActivityEfforts | null>; missing: () => number } {
  let missing = 0;
  return {
    get: async (a) => {
      const e = await getEffortsForView(a);
      if (!e) missing++;
      return e;
    },
    missing: () => missing
  };
}

// Works out which rows are missing or out of date and, if any, starts
// filling them - newest activity first (Today's VO2max looks at the last 90
// days) - one at a time so the screens stay responsive. Only the planning is
// awaited, so the app can show straight away; effortsFill is already running
// when this resolves, and the returned function resolves with how many rows
// it computed once the fill is done. A newer call (the next boot's, or a
// test's) supersedes a running one.
export async function startEffortsBackfill(activities: Activity[]): Promise<() => Promise<number>> {
  const generation = ++backfillGeneration;
  const map = await rows();
  if (generation !== backfillGeneration) return async () => 0;
  const missing: Activity[] = [];
  for (let i = activities.length - 1; i >= 0; i--) {
    const a = activities[i]!;
    const stored = map.get(a.id);
    if (!stored || !effortsAreCurrent(stored, a)) missing.push(a);
  }
  if (missing.length === 0) {
    effortsFill.running = false;
    return async () => 0;
  }
  effortsFill.done = 0;
  effortsFill.total = missing.length;
  effortsFill.running = true;
  return async () => {
    let computed = 0;
    let lastTick = Date.now();
    try {
      for (const a of missing) {
        if (generation !== backfillGeneration) return computed;
        const stored = (await rows()).get(a.id);
        if (!stored || !effortsAreCurrent(stored, a)) {
          await getEfforts(a);
          computed++;
        }
        effortsFill.done++;
        if (Date.now() - lastTick >= FILL_TICK_MS) {
          lastTick = Date.now();
          effortsFill.tick++;
        }
      }
    } catch (e) {
      // Screens go back to computing what they need themselves.
      if (generation === backfillGeneration) {
        effortsFill.running = false;
        effortsFill.tick++;
      }
      throw e;
    }
    effortsFill.running = false;
    effortsFill.tick++;
    return computed;
  };
}

export async function backfillEfforts(activities: Activity[]): Promise<number> {
  return (await startEffortsBackfill(activities))();
}
