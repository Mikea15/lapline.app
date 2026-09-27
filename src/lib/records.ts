// lib/records.ts
// All-time personal records, computed from real activity history - backs
// the Records screen table, the Milestone Ladder, and the "PR"/"NEW" flags
// shown on the Today ledger and Records table.

import type { Activity, ActivityDetail } from './types';
import { sportFamily, type SportFamily } from './sport-color';
import { bestTimeForDistance, bestDistanceForDuration } from './best-effort';

export type RecordKind = 'pace-distance' | 'longest' | 'duration-distance' | 'fastest-avg-speed';

interface RecordDef {
  key: string;
  label: string;
  sport: SportFamily;
  kind: RecordKind;
  targetM?: number;
  durationSec?: number;
}

// bestValue units by kind: pace-distance -> seconds elapsed; longest ->
// kilometres; duration-distance -> kilometres covered; fastest-avg-speed ->
// km/h. Lower is better only for pace-distance.
const RECORD_DEFS: RecordDef[] = [
  { key: '1km', label: '1 km', sport: 'running', kind: 'pace-distance', targetM: 1000 },
  { key: '5km', label: '5 km', sport: 'running', kind: 'pace-distance', targetM: 5000 },
  { key: '10km', label: '10 km', sport: 'running', kind: 'pace-distance', targetM: 10000 },
  { key: 'longest-run', label: 'Longest run', sport: 'running', kind: 'longest' },
  { key: '100m-swim', label: '100 m swim', sport: 'pool-swim', kind: 'pace-distance', targetM: 100 },
  { key: 'longest-swim', label: 'Longest swim', sport: 'pool-swim', kind: 'longest' },
  { key: 'fastest-ride', label: 'Fastest ride', sport: 'cycling', kind: 'fastest-avg-speed' },
  { key: 'best-60min', label: 'Best 60 min', sport: 'running', kind: 'duration-distance', durationSec: 3600 }
];

export interface RecordHistoryPoint {
  date: string;
  value: number;
  activityId: number;
}

export interface RecordResult {
  key: string;
  label: string;
  sport: SportFamily;
  kind: RecordKind;
  bestValue: number | null;
  setDate: string | null;
  setByActivityId: number | null;
  previousValue: number | null;
  /** Up to the last 7 PR-setting activities, oldest -> newest, current best last. */
  history: RecordHistoryPoint[];
  /** True while this row's own value is still being computed - only ever
      set by computeRecordsStreaming's placeholder rows below, never by a
      resolved computeRecord() result. */
  loading?: boolean;
}

/** The record catalog's static shape (key/label/sport/kind), known up front
    with no activity data needed - lets the Records table render its real
    row labels immediately, before any async computation has run. */
export function recordCatalog(): Pick<RecordResult, 'key' | 'label' | 'sport' | 'kind'>[] {
  return RECORD_DEFS.map(({ key, label, sport, kind }) => ({ key, label, sport, kind }));
}

function isBetter(kind: RecordKind, candidate: number, current: number): boolean {
  return kind === 'pace-distance' ? candidate < current : candidate > current;
}

async function computeRecord(
  def: RecordDef,
  activities: Activity[],
  getDetail: (id: number) => Promise<ActivityDetail | null>
): Promise<RecordResult> {
  const relevant = activities.filter((a) => sportFamily(a.sport) === def.sport).sort((a, b) => a.date.localeCompare(b.date));

  const history: RecordHistoryPoint[] = [];
  let best: number | null = null;

  for (const act of relevant) {
    let value: number | null = null;
    if (def.kind === 'longest') {
      value = act.distanceKm > 0 ? act.distanceKm : null;
    } else if (def.kind === 'fastest-avg-speed') {
      value = act.avgSpeedKmh > 0 ? act.avgSpeedKmh : null;
    } else {
      const detail = await getDetail(act.id);
      if (!detail || detail.distance.length < 2) continue;
      if (def.kind === 'pace-distance') {
        value = bestTimeForDistance(detail.distance, detail.t, def.targetM!);
      } else {
        const meters = bestDistanceForDuration(detail.distance, detail.t, def.durationSec!);
        value = meters !== null ? meters / 1000 : null;
      }
    }
    if (value === null || value <= 0) continue;
    if (best === null || isBetter(def.kind, value, best)) {
      history.push({ date: act.date, value, activityId: act.id });
      best = value;
    }
  }

  const last = history[history.length - 1] ?? null;
  const prev = history[history.length - 2] ?? null;

  return {
    key: def.key,
    label: def.label,
    sport: def.sport,
    kind: def.kind,
    bestValue: last?.value ?? null,
    setDate: last?.date ?? null,
    setByActivityId: last?.activityId ?? null,
    previousValue: prev?.value ?? null,
    history: history.slice(-7)
  };
}

export async function computeAllRecords(
  activities: Activity[],
  getDetail: (id: number) => Promise<ActivityDetail | null>
): Promise<RecordResult[]> {
  return Promise.all(RECORD_DEFS.map((def) => computeRecord(def, activities, getDetail)));
}

// Same computation as computeAllRecords, but each record definition still
// runs independently/concurrently (a pace-distance/duration-distance record
// awaits getDetail() per matching activity - the slow part) - onRow fires
// the moment each one resolves, in definition order, so a caller can reveal
// the Records table row by row instead of waiting for the slowest one to
// gate every row at once.
export async function computeRecordsStreaming(
  activities: Activity[],
  getDetail: (id: number) => Promise<ActivityDetail | null>,
  onRow: (index: number, result: RecordResult) => void
): Promise<RecordResult[]> {
  return Promise.all(
    RECORD_DEFS.map((def, i) =>
      computeRecord(def, activities, getDetail).then((r) => {
        onRow(i, r);
        return r;
      })
    )
  );
}

/** Activity ids that currently hold at least one record - drives the "PR"/"NEW" flags. */
export function currentRecordHolderIds(records: RecordResult[]): Set<number> {
  return new Set(records.filter((r) => r.setByActivityId !== null).map((r) => r.setByActivityId!));
}

export interface MilestoneEntry {
  distanceKm: number;
  date: string;
  activityId: number;
}

export interface MilestoneLadder {
  sport: SportFamily;
  entries: MilestoneEntry[]; // longest -> shortest, up to 4
}

// Longest efforts per sport family within [startDate, endDate], for the
// Milestone Ladder - a plain top-N over Activity.distanceKm, no streams
// needed. Bounds are inclusive, matching the header's global date-range
// filter (see App.svelte's rangeStart/rangeEnd) rather than a fixed trailing
// window, so the ladder actually moves when that filter changes.
export function milestoneLadders(activities: Activity[], sports: SportFamily[], startDate: string, endDate: string, topN = 4): MilestoneLadder[] {
  return sports.map((sport) => {
    const entries = activities
      .filter((a) => sportFamily(a.sport) === sport && a.distanceKm > 0 && a.date >= startDate && a.date <= endDate)
      .sort((a, b) => b.distanceKm - a.distanceKm)
      .slice(0, topN)
      .map((a) => ({ distanceKm: a.distanceKm, date: a.date, activityId: a.id }));
    return { sport, entries };
  });
}
