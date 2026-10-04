// lib/parse-workout.ts - what a parse worker (fit-parser.worker.ts) does
// with one file. Kept out of the worker itself so tests can run the same
// code in-process. Only the worker should import this: pulling it into the
// main thread would ship fit-file-parser twice (see fit-parse-pool.ts).
import { parseFIT } from './fit-parser';
import { parseGPX } from './gpx-parser';
import type { ParsedActivity } from './types';
import type { WorkoutFormat } from './fit-parse-pool';

export function parseWorkout(format: WorkoutFormat, bytes: Uint8Array): Promise<ParsedActivity[]> {
  return format === 'gpx' ? Promise.resolve(parseGPX(new TextDecoder('utf-8').decode(bytes))) : parseFIT(bytes);
}
