// scripts/perf/run-bench-page-load.ts - CLI entry point: `npm run perf:page-load`.
// Requires dist/ (`npm run build`) to already exist.
// Kept separate from bench-page-load.ts for the same reason as
// run-bench-functions.ts.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runPageLoadBenchmarks } from './bench-page-load.ts';
import { RAW_DIR, RAW_PAGE_LOAD_JSON, ROOT } from './lib/paths.ts';

const results = await runPageLoadBenchmarks();
mkdirSync(RAW_DIR, { recursive: true });
writeFileSync(RAW_PAGE_LOAD_JSON, JSON.stringify(results, null, 2));
console.log(`[perf] wrote ${results.length} page-load benchmarks to ${path.relative(ROOT, RAW_PAGE_LOAD_JSON)}`);
