// lib/activity-time.ts
// An activity's real start instant. Parsers store it as `startUtc` (an ISO
// UTC timestamp); activities imported before that field existed only have
// the UTC calendar `date` and the local "HH:MM" `startTimeLabel`, so for
// those the instant is rebuilt from the two until "Re-read all files"
// backfills startUtc.
import type { Activity } from './types';

// Rebuilds the start instant from `date` (the start's UTC calendar date) and
// startTimeLabel (the wall-clock "HH:MM" this browser showed for it at
// import). That wall-clock time lands on `date` in UTC on exactly one of the
// local days around it (local is at most 14h from UTC), which pins down the
// instant without knowing the activity location's timezone. Assumes the
// browser is in the same timezone it was in at import - the same assumption
// the label itself makes, and the reason startUtc replaced it. null when
// either field is unusable.
export function startFromLabel(date: string, startTimeLabel: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const hm = /^(\d{2}):(\d{2})/.exec(startTimeLabel);
  if (!d || !hm) return null;
  const [y, mo, day] = [Number(d[1]), Number(d[2]) - 1, Number(d[3])];
  const [h, mi] = [Number(hm[1]), Number(hm[2])];
  for (const offset of [0, -1, 1]) {
    const t = new Date(y, mo, day + offset, h, mi);
    if (t.toISOString().slice(0, 10) === date) return t;
  }
  return null;
}

// The stored startUtc when present and valid, else the label reconstruction
// above; null when neither is usable.
export function activityStart(a: Pick<Activity, 'date' | 'startTimeLabel' | 'startUtc'>): Date | null {
  if (a.startUtc) {
    const t = new Date(a.startUtc);
    if (!Number.isNaN(t.getTime())) return t;
  }
  return startFromLabel(a.date, a.startTimeLabel);
}
