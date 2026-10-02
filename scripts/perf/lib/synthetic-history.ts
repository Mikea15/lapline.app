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
import { addDays, todayStr } from '../../../src/lib/date-utils.ts';
import type { Activity, ActivityDetail, ParsedActivity } from '../../../src/lib/types.ts';

const STUB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures');

export async function loadStubActivities(): Promise<ParsedActivity[]> {
  const files = readdirSync(STUB_DIR).filter((f) => f.toLowerCase().endsWith('.fit'));
  const parsed = await Promise.all(files.map((f) => parseFIT(new Uint8Array(readFileSync(path.join(STUB_DIR, f))))));
  return parsed.flat();
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
  return {
    activities,
    getDetail: async (id: number) => details.get(id) ?? null
  };
}
