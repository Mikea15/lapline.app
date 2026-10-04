import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseFIT } from '../fit-parser';
import { parseGPX } from '../gpx-parser';
import { addDays, daysAgo, daysBetween, todayStr } from '../date-utils';
import { sportFamily } from '../sport-color';
import { bestDistanceForDuration, bestTimeForDistance, kmSplitPaces, maxPlausibleSpeedMps } from '../best-effort';
import {
  computeActivityEfforts,
  effortDistanceForDuration,
  effortsAreCurrent,
  effortTimeForDistance,
  EFFORTS_VERSION,
  type GetEfforts
} from '../activity-efforts';
import { computeAllRecords, recordCatalog, type RecordResult } from '../records';
import { criticalPaceCurves, CRITICAL_PACE_DURATIONS_SEC, type CriticalPacePoint } from '../critical-pace';
import { currentVo2Max, weeklyVo2MaxTrend } from '../vo2max';
import type { Activity, ActivityDetail, ParsedActivity } from '../types';

// Old (per-second detail) against new (stored efforts) on the real
// fixtures: the reference functions below are the pre-v8 computations,
// reading every activity's full streams as Records, Trends and Today did.

const STUB_DIR = fileURLToPath(new URL('../../../test-fixtures/', import.meta.url));

async function loadFixtures(): Promise<ParsedActivity[]> {
  const files = readdirSync(STUB_DIR).sort();
  const out: ParsedActivity[] = [];
  for (const f of files) {
    if (f.endsWith('.fit')) out.push(...(await parseFIT(new Uint8Array(readFileSync(path.join(STUB_DIR, f))))));
    else if (f.endsWith('.gpx')) out.push(...parseGPX(readFileSync(path.join(STUB_DIR, f), 'utf8')));
  }
  return out;
}

let activities: Activity[] = [];
const details = new Map<number, ActivityDetail>();
const getDetail = async (id: number) => details.get(id) ?? null;
const getEfforts: GetEfforts = async (a) => {
  const d = details.get(a.id);
  return d ? computeActivityEfforts(a.id, a.sport, d.distance, d.t) : null;
};

beforeAll(async () => {
  const fixtures = await loadFixtures();
  // Three copies of every fixture, 9 days apart, newest today: about a year
  // of history, so the 7/90-day windows and the previous range all hold
  // something.
  const count = fixtures.length * 3;
  for (let i = 0; i < count; i++) {
    const pa = fixtures[i % fixtures.length]!;
    const id = i + 1;
    const date = addDays(todayStr(), -i * 9);
    const r = pa.records;
    details.set(id, {
      ...pa.activity,
      id,
      date,
      t: r.map((x) => x.t),
      hr: r.map((x) => x.hr),
      cadence: r.map((x) => x.cadence),
      power: r.map((x) => x.power),
      distance: r.map((x) => x.distance),
      temperature: r.map((x) => x.temp),
      altitude: r.map((x) => x.altitude),
      speed: r.map((x) => x.speed),
      perfCondition: r.map((x) => x.perfCondition),
      lat: r.map((x) => x.lat),
      lon: r.map((x) => x.lon),
      laps: pa.laps,
      lengths: pa.lengths
    });
    activities.push({ ...pa.activity, id, date });
  }
  activities = activities.sort((a, b) => a.date.localeCompare(b.date));
}, 60_000);

// ----- the pre-v8 computations -----

const STREAM_TARGETS: Record<string, { targetM?: number; durationSec?: number }> = {
  '1km': { targetM: 1000 },
  '5km': { targetM: 5000 },
  '10km': { targetM: 10000 },
  '100m-swim': { targetM: 100 },
  'best-60min': { durationSec: 3600 }
};

async function recordsRef(acts: Activity[]): Promise<RecordResult[]> {
  const out: RecordResult[] = [];
  for (const def of recordCatalog()) {
    const relevant = acts.filter((a) => sportFamily(a.sport) === def.sport).sort((a, b) => a.date.localeCompare(b.date));
    const history: { date: string; value: number; activityId: number }[] = [];
    let best: number | null = null;
    for (const act of relevant) {
      let value: number | null = null;
      if (def.kind === 'longest') value = act.distanceKm > 0 ? act.distanceKm : null;
      else if (def.kind === 'fastest-avg-speed') value = act.avgSpeedKmh > 0 ? act.avgSpeedKmh : null;
      else {
        const target = STREAM_TARGETS[def.key];
        if (!target) throw new Error(`no reference target for ${def.key}`);
        const detail = await getDetail(act.id);
        if (!detail || detail.distance.length < 2) continue;
        if (def.kind === 'pace-distance') value = bestTimeForDistance(detail.distance, detail.t, target.targetM!, maxPlausibleSpeedMps(act.sport));
        else {
          const meters = bestDistanceForDuration(detail.distance, detail.t, target.durationSec!, maxPlausibleSpeedMps(act.sport));
          value = meters !== null ? meters / 1000 : null;
        }
      }
      if (value === null || value <= 0) continue;
      if (best === null || (def.kind === 'pace-distance' ? value < best : value > best)) {
        history.push({ date: act.date, value, activityId: act.id });
        best = value;
      }
    }
    const last = history[history.length - 1] ?? null;
    const prev = history[history.length - 2] ?? null;
    out.push({
      ...def,
      bestValue: last?.value ?? null,
      setDate: last?.date ?? null,
      setByActivityId: last?.activityId ?? null,
      previousValue: prev?.value ?? null,
      history: history.slice(-7)
    });
  }
  return out;
}

async function curveRef(acts: Activity[]): Promise<CriticalPacePoint[]> {
  const runs = acts.filter((a) => sportFamily(a.sport) === 'running');
  const ds = await Promise.all(runs.map((a) => getDetail(a.id)));
  return CRITICAL_PACE_DURATIONS_SEC.map((durationSec) => {
    let best: number | null = null;
    for (const d of ds) {
      if (!d || d.distance.length < 2) continue;
      const meters = bestDistanceForDuration(d.distance, d.t, durationSec, maxPlausibleSpeedMps(d.sport));
      if (meters && meters > 0) {
        const pace = durationSec / 60 / (meters / 1000);
        if (best === null || pace < best) best = pace;
      }
    }
    return { durationSec, paceMinPerKm: best };
  });
}

function vdotRef(d: ActivityDetail): number | null {
  if (d.distance.length < 2) return null;
  let best: number | null = null;
  for (const s of [300, 600, 900, 1200, 1800, 2700, 3600, 5400]) {
    const m = bestDistanceForDuration(d.distance, d.t, s, maxPlausibleSpeedMps(d.sport));
    if (!m || m <= 0) continue;
    const v = m / (s / 60);
    const min = s / 60;
    const vdot = (-4.6 + 0.182258 * v + 0.000104 * v ** 2) / (0.8 + 0.1894393 * Math.exp(-0.012778 * min) + 0.2989558 * Math.exp(-0.1932605 * min));
    if (vdot > 0 && (best === null || vdot > best)) best = vdot;
  }
  return best;
}

function splitsRef(acts: Activity[]): number[] {
  const out: number[] = [];
  for (const a of acts.filter((x) => sportFamily(x.sport) === 'running')) {
    const d = details.get(a.id)!;
    out.push(...kmSplitPaces(d.distance, d.t, 1000, maxPlausibleSpeedMps(d.sport)));
  }
  return out;
}

// ----- comparisons -----

describe('stored efforts match the per-second computation on the fixtures', () => {
  it('has runs, swims and rides to compare, including a run with GPS spikes', () => {
    const families = new Set(activities.map((a) => sportFamily(a.sport)));
    expect(families).toContain('running');
    expect(families).toContain('pool-swim');
    expect(families).toContain('cycling');
    // The guard matters on at least one fixture, so the comparison covers it.
    const changed = activities.some((a) => {
      const d = details.get(a.id)!;
      return bestTimeForDistance(d.distance, d.t, 1000) !== bestTimeForDistance(d.distance, d.t, 1000, maxPlausibleSpeedMps(a.sport));
    });
    expect(changed).toBe(true);
  });

  it('records', async () => {
    const want = await recordsRef(activities);
    expect(want.some((r) => r.key === '5km' && r.bestValue !== null)).toBe(true);
    expect(await computeAllRecords(activities, getEfforts)).toEqual(want);
  });

  it('critical pace curves, for every range preset', async () => {
    const end = todayStr();
    for (const days of [7, 28, 84, 365, 2000]) {
      const start = addDays(end, -(days - 1));
      const got = await criticalPaceCurves(activities, getEfforts, start, end);
      const rangeDays = daysBetween(start, end) + 1;
      const inRange = (a: Activity, s: string, e: string) => a.date >= s && a.date <= e;
      const prevStart = addDays(start, -rangeDays);
      const prevEnd = addDays(start, -1);
      expect(got).toEqual({
        thisRange: await curveRef(activities.filter((a) => inRange(a, start, end))),
        previousRange: await curveRef(activities.filter((a) => inRange(a, prevStart, prevEnd)))
      });
    }
  });

  it('VO2max, current and weekly', async () => {
    const runs = activities.filter((a) => sportFamily(a.sport) === 'running' && a.distanceKm > 0);
    let best: number | null = null;
    let bestId: number | null = null;
    for (const a of runs.filter((a) => daysAgo(a.date) >= 0 && daysAgo(a.date) < 90)) {
      const v = vdotRef(details.get(a.id)!);
      if (v !== null && (best === null || v > best)) [best, bestId] = [v, a.id];
    }
    const current = await currentVo2Max(activities, getEfforts);
    expect(current.value).not.toBeNull();
    expect(current.value).toBe(Math.round(best! * 10) / 10);
    expect(current.activityId).toBe(bestId);

    const withVdot = runs.map((a) => ({ age: daysAgo(a.date), vdot: vdotRef(details.get(a.id)!) }));
    const want = Array.from({ length: 52 }, (_, i) => {
      const asOf = (51 - i) * 7;
      const inWindow = withVdot.filter((r) => r.vdot !== null && r.age >= 0 && r.age >= asOf && r.age < asOf + 90).map((r) => r.vdot!);
      return inWindow.length ? Math.round(Math.max(...inWindow) * 10) / 10 : null;
    });
    expect(await weeklyVo2MaxTrend(activities, getEfforts, 52)).toEqual(want);
  });

  it('Trends pace histogram splits', async () => {
    const runs = activities.filter((a) => sportFamily(a.sport) === 'running');
    const got: number[] = [];
    for (const a of runs) got.push(...(await getEfforts(a))!.kmSplitPaces);
    expect(got.length).toBeGreaterThan(20);
    expect(got).toEqual(splitsRef(activities));
  });
});

describe('activity efforts', () => {
  it('stores nulls and no splits for an activity without a distance stream', () => {
    const e = computeActivityEfforts(1, 'running', [0], [0]);
    expect(e.bestTimeSec.every((v) => v === null)).toBe(true);
    expect(e.bestDistanceM.every((v) => v === null)).toBe(true);
    expect(e.kmSplitPaces).toEqual([]);
  });

  it('throws for a distance or duration it does not store', () => {
    const e = computeActivityEfforts(1, 'running', [0, 1000], [0, 300]);
    expect(() => effortTimeForDistance(e, 400)).toThrow();
    expect(() => effortDistanceForDuration(e, 61)).toThrow();
  });

  it('is out of date after a version bump or a sport whose speed limit differs', () => {
    const a = { ...activities[0]!, sport: 'running' };
    const e = computeActivityEfforts(a.id, 'running', [0, 1000], [0, 300]);
    expect(effortsAreCurrent(e, a)).toBe(true);
    expect(effortsAreCurrent({ ...e, version: EFFORTS_VERSION - 1 }, a)).toBe(false);
    expect(effortsAreCurrent(e, { ...a, sport: 'cycling' })).toBe(false);
  });
});
