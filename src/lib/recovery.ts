// lib/recovery.ts
// "Hours until fully recovered" - Garmin/Firstbeat's own on-device recovery-
// time estimate (Activity.recoveryTimeHours, parsed from the FIT
// activity_metrics message - see fit-parser.ts), netted against real elapsed
// time since that activity ended. This is the same "counting down from the
// last hard effort" reasoning Garmin Connect's own Recovery Time widget
// uses, not a live/continuous readiness score - this app has no continuous
// monitoring data (no wellness FIT files, only workout ones), so the number
// only updates when a new activity with its own recovery-time estimate is
// imported.

import { activityStart } from './activity-time';
import type { Activity } from './types';

export interface RecoveryStatus {
  hoursRemaining: number | null; // null if no activity has ever reported a recovery-time estimate
  estimateHours: number | null; // the source activity's own full estimate - Today's recovery ring fills as it elapses
  sourceActivityId: number | null;
  sourceDate: string | null;
}

// The activity's real end-of-session timestamp: its start instant (see
// activityStart) plus duration - there is no stored "end timestamp" field
// of its own.
function activityEndTime(a: Activity): Date | null {
  const start = activityStart(a);
  return start && new Date(start.getTime() + a.durationMin * 60000);
}

// The longest still-counting-down recovery window across recent activities -
// not simply the most recent activity's own estimate, since an easy session
// logged today doesn't reset a longer recovery debt a harder session from
// yesterday is still counting down from (the same reasoning Garmin's own
// Recovery Time widget uses: the max of every recent estimate's remaining
// time, not just the latest one's).
export function currentRecovery(activities: Activity[]): RecoveryStatus {
  // Tracked separately from `best` below so this can still attribute a
  // source activity/date once every past estimate has fully counted down to
  // zero, rather than only while one is still active.
  let mostRecentWithData: Activity | null = null;
  let mostRecentEnd: Date | null = null;
  let best: { activity: Activity; remaining: number } | null = null;

  for (const a of activities) {
    if (a.recoveryTimeHours <= 0) continue;
    const end = activityEndTime(a);
    if (!end) continue;

    if (!mostRecentEnd || end > mostRecentEnd) {
      mostRecentWithData = a;
      mostRecentEnd = end;
    }

    const hoursElapsed = (Date.now() - end.getTime()) / 3600000;
    if (hoursElapsed < 0) continue; // future-dated data (clock skew) - ignore rather than show a negative countdown
    const remaining = a.recoveryTimeHours - hoursElapsed;
    if (remaining > 0 && (!best || remaining > best.remaining)) {
      best = { activity: a, remaining };
    }
  }

  if (!mostRecentWithData) return { hoursRemaining: null, estimateHours: null, sourceActivityId: null, sourceDate: null };
  if (!best) return { hoursRemaining: 0, estimateHours: mostRecentWithData.recoveryTimeHours, sourceActivityId: mostRecentWithData.id, sourceDate: mostRecentWithData.date };
  return { hoursRemaining: Math.round(best.remaining), estimateHours: best.activity.recoveryTimeHours, sourceActivityId: best.activity.id, sourceDate: best.activity.date };
}
