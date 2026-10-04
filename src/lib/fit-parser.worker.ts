// lib/fit-parser.worker.ts
// Parses .fit and .gpx files off the main thread so importing many files
// in a row doesn't freeze the UI, and so a pool of these can parse several
// files in true parallel across CPU cores (see fit-parse-pool.ts).
//
// @ts-nocheck -- this module executes in a Worker global scope, which
// conflicts with the project's DOM-lib tsconfig (Window vs
// WorkerGlobalScope typings for `self`/`postMessage`); not worth a second
// tsconfig for one small file.

import { parseWorkout } from './parse-workout';

self.onmessage = async (e) => {
  const { id, format, bytes } = e.data;
  try {
    const activities = await parseWorkout(format, bytes);
    self.postMessage({ id, activities });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
