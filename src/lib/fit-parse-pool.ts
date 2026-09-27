// lib/fit-parse-pool.ts
// A small fixed-size pool of fit-parser.worker.ts instances so a bulk
// import can parse several .fit files at once instead of one at a time -
// FIT parsing is CPU-bound (walking every record in a multi-hour file),
// so this is the part of import that actually benefits from real
// parallelism, unlike the DB writes that follow it.
import type { ParsedActivity } from './types';

export interface FitParsePool {
  // onStart fires once a worker actually picks the file up, not when it's
  // merely queued behind a busy pool - so callers can show an honest
  // "processing" status instead of marking every queued file as active.
  parse(bytes: Uint8Array, onStart?: () => void): Promise<ParsedActivity[]>;
  terminate(): void;
}

export function createFitParsePool(fileCount: number): FitParsePool {
  const size = Math.max(1, Math.min(fileCount, navigator.hardwareConcurrency || 4, 6));
  const workers = Array.from(
    { length: size },
    () => new Worker(new URL('./fit-parser.worker.ts', import.meta.url), { type: 'module' })
  );
  const idle = workers.slice();
  const waiting: (() => void)[] = [];
  const pending = new Map<number, { resolve: (v: ParsedActivity[]) => void; reject: (e: Error) => void }>();
  let nextId = 0;

  for (const worker of workers) {
    worker.onmessage = (e: MessageEvent) => {
      const { id, activities, error } = e.data;
      const task = pending.get(id);
      pending.delete(id);
      idle.push(worker);
      waiting.shift()?.();
      if (!task) return;
      if (error) task.reject(new Error(error));
      else task.resolve(activities);
    };
  }

  function acquire(): Promise<Worker> {
    const worker = idle.pop();
    if (worker) return Promise.resolve(worker);
    return new Promise((resolve) => {
      waiting.push(() => resolve(idle.pop()!));
    });
  }

  return {
    async parse(bytes: Uint8Array, onStart?: () => void): Promise<ParsedActivity[]> {
      const worker = await acquire();
      onStart?.();
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        // Structured-cloned (not transferred): the caller keeps `bytes`
        // afterwards to store as the activity's re-parseable raw file.
        worker.postMessage({ id, bytes });
      });
    },
    terminate() {
      for (const worker of workers) worker.terminate();
    }
  };
}
