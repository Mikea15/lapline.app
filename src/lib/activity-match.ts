// lib/activity-match.ts
// Which already-stored activity (if any) a freshly-parsed one should
// overwrite when its file has no by-position match of its own - the
// fallback that keeps re-importing an identical file idempotent (see
// saveActivities in stores.svelte.ts).
//
// Date + sport alone is not an identity: two rides on the same day are
// two real sessions, and matching on just those two fields made the second
// one silently overwrite the first (which one survived depended on which
// file the parse worker pool happened to finish last). The local start
// time ("HH:MM") tells same-day sessions apart, so it's part of the match
// whenever the new activity has one. Only a start-time-less activity (no
// start timestamp in its file) falls back to date + sport, since there's
// nothing better to identify it by. When both sides have the UTC start
// instant, that's compared instead: the "HH:MM" label depends on the
// browser's timezone at import, so the same file re-imported while
// travelling would otherwise not match itself.
import type { Activity } from './types';

type MatchFields = Pick<Activity, 'startTimeLabel' | 'startUtc'>;

export function findExistingActivity<T extends MatchFields>(sameDateAndSport: T[], parsed: MatchFields): T | undefined {
  if (!parsed.startTimeLabel) return sameDateAndSport[0];
  return sameDateAndSport.find((a) =>
    a.startUtc && parsed.startUtc ? a.startUtc === parsed.startUtc : a.startTimeLabel === parsed.startTimeLabel
  );
}
