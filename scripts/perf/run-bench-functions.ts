// scripts/perf/run-bench-functions.ts - CLI entry point: `npm run perf:functions`.
// Kept separate from bench-functions.ts (which only exports
// runFunctionBenchmarks) so report.ts can import that function without
// triggering a second run-and-write as an import side effect.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runFunctionBenchmarks } from './bench-functions.ts';
import { RAW_DIR, RAW_FUNCTIONS_JSON, ROOT } from './lib/paths.ts';

const results = await runFunctionBenchmarks();
mkdirSync(RAW_DIR, { recursive: true });
writeFileSync(RAW_FUNCTIONS_JSON, JSON.stringify(results, null, 2));
console.log(`[perf] wrote ${results.length} function benchmarks to ${path.relative(ROOT, RAW_FUNCTIONS_JSON)}`);
