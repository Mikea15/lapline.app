// lib/fit-parse-pool.ts
// A small fixed-size pool of fit-parser.worker.ts instances so a bulk
// import can parse several .fit/.gpx files at once instead of one at a
// time - parsing is CPU-bound (walking every record in a multi-hour file),
// so this is the part of import that actually benefits from real
// parallelism, unlike the DB writes that follow it. Every parse goes
// through here - import, backup restore and Settings > "Re-read all files", GPX
// as well as FIT - so the page never freezes on a big file, and the main
// thread never loads the parsers: fit-file-parser ships once, in the
// worker's chunk. (fitFailureReason in import-failure.ts reads a failed
// file on the main thread with the small fit-rewrite.ts walker, not the
// parser.)
//
// A file's bytes are read only once a worker is free to parse them, so a
// big import holds a few files in memory at a time, not all of them.
//
// A worker that crashes (script failed to load, out of memory), sends a
// reply that can't be read, or takes longer than the timeout fails only
// the file it was working on: it's terminated, its slot is freed, and the
// next queued file gets a fresh worker. Workers are created on demand, so
// a script that never loads fails each file once instead of respawning in
// a loop.
import type { ParsedActivity } from './types';

/** How long one file may take to parse before its worker is killed. */
export const FIT_PARSE_TIMEOUT_MS = 60_000;

export type WorkoutFormat = 'fit' | 'gpx';

export function workoutFormat(filename: string): WorkoutFormat {
  return filename.toLowerCase().endsWith('.gpx') ? 'gpx' : 'fit';
}

export interface ParseJob {
  format: WorkoutFormat;
  /** Called once a worker is free; a rejection fails the file. */
  read: () => Promise<Uint8Array>;
}

export interface FitParsePool {
  /** How many workers run at once. */
  readonly size: number;
  // onStart fires once a worker actually picks the file up, not when it's
  // merely queued behind a busy pool - so callers can show an honest
  // "processing" status instead of marking every queued file as active.
  parse(job: ParseJob, onStart?: () => void): Promise<ParsedActivity[]>;
  terminate(): void;
}

export interface FitParsePoolOptions {
  timeoutMs?: number;
  /** For tests: stands in for the real module worker. */
  createWorker?: () => Worker;
}

interface WorkerReply {
  id: number;
  activities?: ParsedActivity[];
  error?: string;
}

interface Task {
  id: number;
  resolve: (v: ParsedActivity[]) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function createParseWorker(): Worker {
  return new Worker(new URL('./fit-parser.worker.ts', import.meta.url), { type: 'module' });
}

export function createFitParsePool(fileCount: number, options: FitParsePoolOptions = {}): FitParsePool {
  const { timeoutMs = FIT_PARSE_TIMEOUT_MS, createWorker = createParseWorker } = options;
  const size = Math.max(1, Math.min(fileCount, navigator.hardwareConcurrency || 4, 6));
  const workers = new Set<Worker>();
  const idle: Worker[] = [];
  const running = new Map<Worker, Task>();
  const waiting: (() => void)[] = [];
  let nextId = 0;
  let closed = false;

  function spawn(): Worker {
    const worker = createWorker();
    workers.add(worker);
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const task = running.get(worker);
      if (!task || task.id !== e.data.id) return;
      clearTimeout(task.timer);
      release(worker);
      if (e.data.error !== undefined) task.reject(new Error(e.data.error));
      else task.resolve(e.data.activities ?? []);
    };
    worker.onerror = (e: ErrorEvent) => {
      // Handled here: don't also report it as an uncaught page error.
      e.preventDefault();
      retire(worker, `the file reader stopped unexpectedly${e.message ? ` (${e.message})` : ''}`);
    };
    worker.onmessageerror = () => retire(worker, "the file reader's reply couldn't be read");
    return worker;
  }

  // The task finished normally: the worker goes back to the pool (unless
  // it was retired or the pool closed meanwhile).
  function release(worker: Worker): void {
    running.delete(worker);
    if (closed || !workers.has(worker)) return;
    idle.push(worker);
    waiting.shift()?.();
  }

  // The worker is broken or stuck: kill it, fail its file, free its slot.
  function retire(worker: Worker, reason: string): void {
    if (!workers.delete(worker)) return; // already retired
    const task = running.get(worker);
    running.delete(worker);
    const i = idle.indexOf(worker);
    if (i >= 0) idle.splice(i, 1);
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    if (task) {
      clearTimeout(task.timer);
      task.reject(new Error(reason));
    }
    if (!closed) waiting.shift()?.();
  }

  // Resolves synchronously inside the waker, so a freed worker or slot is
  // claimed by the file that was woken for it.
  function acquire(): Promise<Worker> {
    if (closed) return Promise.reject(new Error('the import was stopped'));
    const worker = idle.pop();
    if (worker) return Promise.resolve(worker);
    if (workers.size < size) return Promise.resolve(spawn());
    return new Promise((resolve, reject) => {
      waiting.push(() => acquire().then(resolve, reject));
    });
  }

  return {
    size,
    async parse(job: ParseJob, onStart?: () => void): Promise<ParsedActivity[]> {
      const worker = await acquire();
      onStart?.();
      let bytes: Uint8Array;
      try {
        bytes = await job.read();
      } catch (e) {
        release(worker);
        throw e;
      }
      // Retired while the file was being read (crashed, or the pool closed).
      if (!workers.has(worker)) throw new Error(closed ? 'the import was stopped' : 'the file reader stopped unexpectedly');
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => retire(worker, `reading this file took longer than ${Math.round(timeoutMs / 1000)} s`),
          timeoutMs
        );
        const task: Task = { id, resolve, reject, timer };
        running.set(worker, task);
        try {
          // Structured-cloned (not transferred): the caller keeps `bytes`
          // afterwards to store as the activity's re-parseable raw file.
          worker.postMessage({ id, format: job.format, bytes });
        } catch (e) {
          clearTimeout(timer);
          release(worker);
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    },
    terminate() {
      closed = true;
      for (const worker of [...workers]) retire(worker, 'the import was stopped');
      for (const wake of waiting.splice(0)) wake();
    }
  };
}
