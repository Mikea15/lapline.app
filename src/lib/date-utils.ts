// lib/date-utils.ts
// Shared date-window helpers, used by both the Overview dashboard and the
// Activities list so their time-frame filters behave identically.

export function daysAgo(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((now.getTime() - d.getTime()) / 86400000);
}

// A Date -> "YYYY-MM-DD" in the viewer's local timezone. Deliberately not
// `d.toISOString().split('T')[0]`, which reads off the UTC date instead of
// the local one - for any positive-UTC-offset timezone (ahead of UTC, e.g.
// Europe, Australia, most of Asia), local midnight is still the *previous*
// day in UTC, so that shortcut silently reports yesterday's date for the
// start of every local day (the bug ConsistencyHeatmap.svelte's own
// toDateStr had, misaligning its whole calendar for those timezones).
export function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "YYYY-MM-DD" for today, in the viewer's local timezone.
export function todayStr(): string {
  return dateToStr(new Date());
}

// "YYYY-MM-DD" + a (possibly negative) day offset -> "YYYY-MM-DD".
export function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return dateToStr(d);
}

// Whole days between two "YYYY-MM-DD" strings (b - a).
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
}

// "YYYY-MM-DD" (the stored format) -> "DD/MM/YYYY". Pure string rearrangement,
// no Date parsing, so it can't be shifted by timezone handling.
export function formatDateDMY(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "YYYY-MM-DD" -> "Sat 5 Sep 2026". Built from fixed name tables rather than
// toLocaleDateString() so the format is exact and doesn't vary by the
// viewer's browser locale (some locales insert a comma, spell the month out
// in full, etc.). Parsed the same way daysAgo() does (local midnight), so
// this can't drift a day off of any other date display in the app.
export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${WEEKDAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// "YYYY-MM-DD" -> "5 Sep" - the shorter form used where a year would be
// redundant (e.g. right next to a full date elsewhere on the same screen).
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

// A [start, end] range label, e.g. for the header's custom-range or the
// Milestone Ladder's selected window. Omits the year on both ends when they
// fall in the same calendar year (formatDateShort's usual "5 Sep–13 Sep"),
// but includes it on both when the range crosses a year boundary - the
// 'All' preset and a wide custom drag can both span years, and a bare
// "9 Sep–13 Sep" reads as a few days instead of the true multi-year span.
export function formatDateRangeShort(start: string, end: string): string {
  if (start.slice(0, 4) === end.slice(0, 4)) return `${formatDateShort(start)}–${formatDateShort(end)}`;
  const withYear = (s: string) => `${formatDateShort(s)} ${s.slice(0, 4)}`;
  return `${withYear(start)}–${withYear(end)}`;
}

// An RFC3339 timestamp -> "just now" / "5m ago" / "3h ago" / "2d ago",
// falling back to a short date once it's more than a week old - used for
// the header's "synced" label so it reads relative to now rather than a
// raw timestamp.
export function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDateShort(iso.slice(0, 10));
}

// Total seconds -> "H:MM:SS", or "M:SS" once under an hour - shared by
// every screen/table that shows an elapsed/moving duration (Activities
// list, Splits table, the Activity detail screen), previously three
// copy-pasted implementations that had already drifted to take minutes in
// one place and seconds in the other two.
export function formatClock(totalSec: number): string {
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}

export type Timeframe = 'all' | '7d' | '1m' | '3m' | '6m' | '1y';

const TIMEFRAME_DAYS: Record<Exclude<Timeframe, 'all'>, number> = {
  '7d': 7,
  '1m': 30,
  '3m': 90,
  '6m': 182,
  '1y': 365
};

export function timeframeToDays(timeframe: Timeframe): number | null {
  if (timeframe === 'all') return null;
  return TIMEFRAME_DAYS[timeframe];
}

// Maps a date to its trailing bucket index (0 = oldest, numBuckets-1 = most
// recent, e.g. "this week") across `numBuckets` bucketSizeDays-wide windows
// ending today - a trailing window, not a calendar-aligned one, consistent
// with every other timeframe filter in the app. Returns null for dates
// outside the window (in the future, or older than numBuckets*bucketSizeDays
// days ago).
export function bucketIndexForDate(dateStr: string, numBuckets: number, bucketSizeDays: number): number | null {
  const age = daysAgo(dateStr);
  if (age < 0 || age >= numBuckets * bucketSizeDays) return null;
  const bucketFromNow = Math.floor(age / bucketSizeDays);
  return numBuckets - 1 - bucketFromNow;
}

// The inverse of bucketIndexForDate: the earliest calendar date inside
// bucket `idx`. Used to label a bucket with a real date once a chart has
// dropped its empty buckets - at that point the index no longer means
// "N buckets ago" on its own, so the axis needs an actual date instead of a
// relative "w{idx}" label.
export function bucketStartDate(idx: number, numBuckets: number, bucketSizeDays: number): string {
  const bucketsAgo = numBuckets - 1 - idx;
  return addDays(todayStr(), -(bucketsAgo * bucketSizeDays + bucketSizeDays - 1));
}

export const TIMEFRAME_OPTIONS: [Timeframe, string][] = [
  ['all', 'All time'],
  ['7d', '7 days'],
  ['1m', '1 month'],
  ['3m', '3 months'],
  ['6m', '6 months'],
  ['1y', '1 year']
];
