// scripts/perf/lib/synthetic-history.ts
// Builds a realistically-sized activity history for benchmarking the
// records/training-load/vo2max functions, which all scale with activity
// count. The project's real .fit fixtures (test-fixtures/) (src/lib/__tests__ uses
// the same ones) are the only real fixtures available, so this cycles
// through them - real parsed records/laps, just re-dated and re-numbered -
// rather than fabricating synthetic stream data that wouldn't exercise the
// same code paths (e.g. best-effort's sliding window over real GPS/pace noise).

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseFIT } from '../../../src/lib/fit-parser.ts';
import { parseGPX } from '../../../src/lib/gpx-parser.ts';
import { addDays, todayStr } from '../../../src/lib/date-utils.ts';
import { computeActivityEfforts, type ActivityEfforts, type GetEfforts } from '../../../src/lib/activity-efforts.ts';
import type { Activity, ActivityDetail, ParsedActivity } from '../../../src/lib/types.ts';

const STUB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures');

// `gpx: true` adds the GPX fixtures: runs recorded every second (the .fit
// runs are smart-recorded, one point every few seconds), so a history built
// from both has the per-second density a phone or 1 s-recording watch gives.
export async function loadStubActivities({ gpx = false }: { gpx?: boolean } = {}): Promise<ParsedActivity[]> {
  const files = readdirSync(STUB_DIR).sort();
  const fit = files.filter((f) => f.toLowerCase().endsWith('.fit'));
  const parsed = await Promise.all(fit.map((f) => parseFIT(new Uint8Array(readFileSync(path.join(STUB_DIR, f))))));
  if (gpx) {
    for (const f of files.filter((f) => f.toLowerCase().endsWith('.gpx'))) {
      parsed.push(parseGPX(readFileSync(path.join(STUB_DIR, f), 'utf8')));
    }
  }
  return parsed.flat();
}

// Dates for a `count`-activity history ending today: spread evenly over
// count * 2 days, capped at ten years, so 500 activities cover ~3 years
// (one every two days) and 5,000 cover ten (several days with two
// sessions) - a heavy but plausible training log rather than one
// stretching back decades.
export function syntheticDates(count: number): string[] {
  const end = todayStr();
  const spanDays = Math.min(count * 2, 3650);
  return Array.from({ length: count }, (_, i) => addDays(end, -Math.floor((i * spanDays) / count)));
}

function toDetail(pa: ParsedActivity, id: number, date: string): ActivityDetail {
  return {
    ...pa.activity,
    id,
    date,
    t: pa.records.map((r) => r.t),
    hr: pa.records.map((r) => r.hr),
    cadence: pa.records.map((r) => r.cadence),
    power: pa.records.map((r) => r.power),
    distance: pa.records.map((r) => r.distance),
    temperature: pa.records.map((r) => r.temp),
    altitude: pa.records.map((r) => r.altitude),
    speed: pa.records.map((r) => r.speed),
    perfCondition: pa.records.map((r) => r.perfCondition),
    lat: pa.records.map((r) => r.lat),
    lon: pa.records.map((r) => r.lon),
    laps: pa.laps,
    lengths: pa.lengths
  };
}

export interface SyntheticHistory {
  activities: Activity[];
  getDetail: (id: number) => Promise<ActivityDetail | null>;
  /** Each activity's efforts, computed from its detail on first use and kept - the app's steady state, rows already stored. */
  getEfforts: GetEfforts;
}

// `count` activities spread 3 days apart ending today, cycling through the
// real stub activities - deterministic (no randomness) so bench results are
// comparable build-to-build.
export function buildSyntheticHistory(stubs: ParsedActivity[], count: number): SyntheticHistory {
  const details = new Map<number, ActivityDetail>();
  const activities: Activity[] = [];
  const end = todayStr();
  for (let i = 0; i < count; i++) {
    const source = stubs[i % stubs.length]!;
    const id = i + 1;
    const date = addDays(end, -i * 3);
    const detail = toDetail(source, id, date);
    details.set(id, detail);
    const { t, hr, cadence, power, distance, temperature, altitude, speed, perfCondition, lat, lon, laps, ...activity } = detail;
    activities.push(activity);
  }
  const efforts = new Map<number, ActivityEfforts>();
  return {
    activities,
    getDetail: async (id: number) => details.get(id) ?? null,
    getEfforts: async (a: Activity) => {
      const d = details.get(a.id);
      if (!d) return null;
      let e = efforts.get(a.id);
      if (!e) efforts.set(a.id, (e = computeActivityEfforts(a.id, a.sport, d.distance, d.t)));
      return e;
    }
  };
}
