// scripts/perf/bench-functions.ts
// Benchmarks the app's CPU-heaviest lib functions against real (test-fixtures)
// and synthetically-scaled activity histories, so a regression in one of
// these - an accidentally-quadratic loop, a lost memoization - shows up as a
// number in the perf report instead of just "the app feels slower" months
// later. Run standalone with `npm run perf:functions`, or as part of
// `npm run build` via report.ts.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { timeitAsync, type TimingResult } from './lib/timeit.ts';
import { loadStubActivities, buildSyntheticHistory } from './lib/synthetic-history.ts';
import { ROOT } from './lib/paths.ts';

import { parseFIT } from '../../src/lib/fit-parser.ts';
import { computeAllRecords, milestoneLadders } from '../../src/lib/records.ts';
import { criticalPaceCurves } from '../../src/lib/critical-pace.ts';
import { currentVo2Max, weeklyVo2MaxTrend } from '../../src/lib/vo2max.ts';
import { currentRecovery } from '../../src/lib/recovery.ts';
import { weeklyLoadBuckets, trailingMean, acuteChronicRatio } from '../../src/lib/training-load.ts';
import { runVolumeBars, zoneSeconds } from '../../src/lib/today-kpis.ts';
import { bestTimeForDistance, bestDistanceForDuration, kmSplitPaces } from '../../src/lib/best-effort.ts';
import { smooth } from '../../src/lib/smoothing.ts';
import { addDays, todayStr } from '../../src/lib/date-utils.ts';

const STUB_DIR = path.join(ROOT, 'test-fixtures');

// Roughly two years of a 3-day-a-week training history - large enough that
// an accidentally-quadratic pass over `activities` is visible in the timing,
// while still finishing in well under a second on a healthy implementation.
const SYNTHETIC_ACTIVITY_COUNT = 240;

export async function runFunctionBenchmarks(): Promise<TimingResult[]> {
  const stubFiles = readdirSync(STUB_DIR).filter((f) => f.toLowerCase().endsWith('.fit'));
  const stubBytes = stubFiles.map((f) => new Uint8Array(readFileSync(path.join(STUB_DIR, f))));

  const results: TimingResult[] = [];

  results.push(
    await timeitAsync(
      'fit-parser.parseFIT (all stub files)',
      () => Promise.all(stubBytes.map((bytes) => parseFIT(bytes))),
      { iterations: 8, warmup: 2 }
    )
  );

  const stubs = await loadStubActivities();
  const { activities, getDetail } = buildSyntheticHistory(stubs, SYNTHETIC_ACTIVITY_COUNT);
  const endDate = todayStr();
  const startDate = addDays(endDate, -365);
  const sports: ('running' | 'cycling' | 'pool-swim' | 'cardio' | 'other')[] = ['running', 'cycling', 'pool-swim', 'cardio', 'other'];

  results.push(await timeitAsync(`records.computeAllRecords (${SYNTHETIC_ACTIVITY_COUNT} activities)`, () => computeAllRecords(activities, getDetail)));
  results.push(await timeitAsync(`records.milestoneLadders (${SYNTHETIC_ACTIVITY_COUNT} activities)`, () => milestoneLadders(activities, sports, startDate, endDate)));
  results.push(await timeitAsync(`critical-pace.criticalPaceCurves (${SYNTHETIC_ACTIVITY_COUNT} activities)`, () => criticalPaceCurves(activities, getDetail, startDate, endDate)));
  results.push(await timeitAsync(`vo2max.currentVo2Max (${SYNTHETIC_ACTIVITY_COUNT} activities)`, () => currentVo2Max(activities, getDetail)));
  results.push(await timeitAsync(`vo2max.weeklyVo2MaxTrend (52 weeks)`, () => weeklyVo2MaxTrend(activities, getDetail, 52)));
  results.push(await timeitAsync(`recovery.currentRecovery (${SYNTHETIC_ACTIVITY_COUNT} activities)`, () => currentRecovery(activities)));

  results.push(
    await timeitAsync('training-load.weeklyLoadBuckets + trailingMean + acuteChronicRatio (52 weeks)', () => {
      const buckets = weeklyLoadBuckets(activities, 52);
      trailingMean(buckets.map((b) => b.load), 4);
      return acuteChronicRatio(activities);
    })
  );
  results.push(await timeitAsync('today-kpis.runVolumeBars (1 year)', () => runVolumeBars(activities, 365)));
  results.push(await timeitAsync('today-kpis.zoneSeconds (1 year)', () => zoneSeconds(activities, 365)));

  // Best-effort search runs over one real activity's full record stream -
  // the per-activity Activity screen path, not the whole-history one above.
  const longestRun = stubs.reduce((a, b) => (b.records.length > a.records.length ? b : a));
  const distance = longestRun.records.map((r) => r.distance);
  const t = longestRun.records.map((r) => r.t);
  results.push(
    await timeitAsync(`best-effort.bestTimeForDistance (1 activity, ${distance.length} samples)`, () => bestTimeForDistance(distance, t, 5000))
  );
  results.push(
    await timeitAsync(`best-effort.bestDistanceForDuration (1 activity, ${distance.length} samples)`, () => bestDistanceForDuration(distance, t, 1200))
  );
  results.push(await timeitAsync(`best-effort.kmSplitPaces (1 activity, ${distance.length} samples)`, () => kmSplitPaces(distance, t)));
  results.push(
    await timeitAsync(`smoothing.smooth (1 activity, ${longestRun.records.length} samples)`, () => smooth(longestRun.records.map((r) => r.hr)))
  );

  return results;
}
