// scripts/perf/report.ts
// Orchestrates the whole performance-report pipeline and is what `npm run
// build` invokes after `vite build`: reads the bundle-size numbers the
// perf-bundle-report Vite plugin (vite-bundle-plugin.ts) just wrote, runs
// the hot-function and page-load benchmarks, compares every metric against
// the previous report (reports/latest.json), and writes out a timestamped
// history entry plus reports/latest.{json,md}. This is how performance
// regressions get caught automatically instead of only being noticed once
// the app "feels slow".
//
// Non-fatal by default - a regression is printed and recorded but doesn't
// fail the build. Set PERF_STRICT=1 to exit 1 when any regression is found
// (e.g. for a CI gate).

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { HISTORY_DIR, LATEST_JSON, LATEST_MD, RAW_BUNDLE_JSON, ROOT } from './lib/paths.ts';
import type { BundleEntry } from './vite-bundle-plugin.ts';
import { compareMetric, type MetricComparison } from './lib/compare.ts';
import { runFunctionBenchmarks } from './bench-functions.ts';
import { runPageLoadBenchmarks } from './bench-page-load.ts';
import type { TimingResult } from './lib/timeit.ts';

const FUNCTION_REGRESSION_THRESHOLD_PCT = 15;
const PAGE_LOAD_REGRESSION_THRESHOLD_PCT = 15;
const BUNDLE_REGRESSION_THRESHOLD_PCT = 5;
// Below these, an absolute swing is too small to matter regardless of the
// percentage change - see CompareOptions.minAbsoluteDelta.
const FUNCTION_MIN_ABSOLUTE_DELTA_MS = 0.5;
// Cold-boot timing has real machine-load jitter of several ms even with no
// code change at all - a higher floor than the function-timing one avoids
// flagging that as a "regression" on every build.
const PAGE_LOAD_MIN_ABSOLUTE_DELTA_MS = 15;
const BUNDLE_MIN_ABSOLUTE_DELTA_BYTES = 2048;

interface BundleSummary {
  totalBytes: number;
  totalGzipBytes: number;
  entries: BundleEntry[];
}

interface PerfReport {
  timestamp: string;
  commit: string;
  bundle: BundleSummary;
  functions: TimingResult[];
  pageLoad: TimingResult[];
}

function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function readBundleSummary(): BundleSummary {
  if (!existsSync(RAW_BUNDLE_JSON)) {
    throw new Error(
      `${path.relative(ROOT, RAW_BUNDLE_JSON)} not found - run \`vite build\` first (the perf-bundle-report plugin writes this during the build).`
    );
  }
  return JSON.parse(readFileSync(RAW_BUNDLE_JSON, 'utf-8'));
}

function loadPreviousReport(): PerfReport | null {
  if (!existsSync(LATEST_JSON)) return null;
  return JSON.parse(readFileSync(LATEST_JSON, 'utf-8'));
}

function buildComparisons(report: PerfReport, previous: PerfReport | null): MetricComparison[] {
  const comparisons: MetricComparison[] = [];
  const prevFunctionByName = new Map((previous?.functions ?? []).map((f) => [f.name, f.medianMs]));
  const prevPageLoadByName = new Map((previous?.pageLoad ?? []).map((f) => [f.name, f.medianMs]));

  comparisons.push(
    compareMetric('bundle.totalBytes', 'bytes', report.bundle.totalBytes, previous?.bundle.totalBytes, {
      direction: 'lowerIsBetter',
      thresholdPct: BUNDLE_REGRESSION_THRESHOLD_PCT,
      minAbsoluteDelta: BUNDLE_MIN_ABSOLUTE_DELTA_BYTES
    })
  );
  comparisons.push(
    compareMetric('bundle.totalGzipBytes', 'bytes', report.bundle.totalGzipBytes, previous?.bundle.totalGzipBytes, {
      direction: 'lowerIsBetter',
      thresholdPct: BUNDLE_REGRESSION_THRESHOLD_PCT,
      minAbsoluteDelta: BUNDLE_MIN_ABSOLUTE_DELTA_BYTES
    })
  );
  for (const f of report.functions) {
    comparisons.push(
      compareMetric(`fn: ${f.name}`, 'ms', f.medianMs, prevFunctionByName.get(f.name), {
        direction: 'lowerIsBetter',
        thresholdPct: FUNCTION_REGRESSION_THRESHOLD_PCT,
        minAbsoluteDelta: FUNCTION_MIN_ABSOLUTE_DELTA_MS
      })
    );
  }
  for (const p of report.pageLoad) {
    comparisons.push(
      compareMetric(`page: ${p.name}`, 'ms', p.medianMs, prevPageLoadByName.get(p.name), {
        direction: 'lowerIsBetter',
        thresholdPct: PAGE_LOAD_REGRESSION_THRESHOLD_PCT,
        minAbsoluteDelta: PAGE_LOAD_MIN_ABSOLUTE_DELTA_MS
      })
    );
  }
  return comparisons;
}

function formatValue(unit: string, value: number): string {
  if (unit === 'bytes') return `${(value / 1024).toFixed(1)} KB`;
  if (unit === 'ms') return `${value.toFixed(1)} ms`;
  return String(value);
}

function toMarkdown(report: PerfReport, comparisons: MetricComparison[]): string {
  const lines: string[] = [];
  lines.push(`# Performance report`);
  lines.push('');
  lines.push(`Build: \`${report.commit}\` at ${report.timestamp}`);
  lines.push('');
  const regressions = comparisons.filter((c) => c.regression);
  lines.push(regressions.length > 0 ? `**${regressions.length} regression(s) found.**` : 'No regressions found.');
  lines.push('');
  lines.push('| Metric | Current | Previous | Δ | |');
  lines.push('|---|---|---|---|---|');
  for (const c of comparisons) {
    const prev = c.previous === null ? '—' : formatValue(c.unit, c.previous);
    const delta = c.deltaPct === null ? '—' : `${c.deltaPct >= 0 ? '+' : ''}${c.deltaPct.toFixed(1)}%`;
    lines.push(`| ${c.name} | ${formatValue(c.unit, c.current)} | ${prev} | ${delta} | ${c.regression ? 'REGRESSION' : ''} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const bundle = readBundleSummary();
  console.log('[perf] running function benchmarks...');
  const functions = await runFunctionBenchmarks();
  console.log('[perf] running page-load benchmarks (this launches a headless browser)...');
  const pageLoad = await runPageLoadBenchmarks();

  const report: PerfReport = {
    timestamp: new Date().toISOString(),
    commit: gitCommit(),
    bundle,
    functions,
    pageLoad
  };

  const previous = loadPreviousReport();
  const comparisons = buildComparisons(report, previous);
  const regressions = comparisons.filter((c) => c.regression);

  mkdirSync(HISTORY_DIR, { recursive: true });
  const historyFile = path.join(HISTORY_DIR, `${report.timestamp.replace(/[:.]/g, '-')}.json`);
  writeFileSync(historyFile, JSON.stringify(report, null, 2));
  writeFileSync(LATEST_JSON, JSON.stringify(report, null, 2));
  writeFileSync(LATEST_MD, toMarkdown(report, comparisons));

  console.log('');
  console.log(`[perf] report written to ${path.relative(ROOT, LATEST_MD)} (history: ${path.relative(ROOT, historyFile)})`);
  if (previous === null) {
    console.log('[perf] no previous report found - this run is the new baseline.');
  } else if (regressions.length === 0) {
    console.log('[perf] no regressions found.');
  } else {
    console.log(`[perf] ${regressions.length} REGRESSION(S) FOUND:`);
    for (const r of regressions) {
      console.log(`  - ${r.name}: ${formatValue(r.unit, r.previous!)} -> ${formatValue(r.unit, r.current)} (${r.deltaPct!.toFixed(1)}%)`);
    }
  }

  if (regressions.length > 0 && process.env.PERF_STRICT === '1') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[perf] report generation failed:', err);
  // Perf reporting failing shouldn't be silent, but it also shouldn't be
  // indistinguishable from an actual regression gate failure.
  process.exitCode = 2;
});
