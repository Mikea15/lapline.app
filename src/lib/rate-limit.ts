// lib/rate-limit.ts
// Serializes async calls through a shared queue with a minimum spacing
// between them - used by lib/geocode.ts and lib/weather.ts so concurrent
// lookups (e.g. opening several activities in a row) still respect each
// provider's own request-rate expectations instead of each call racing
// its own timer.

export function createThrottle(minIntervalMs: number) {
  let queue: Promise<unknown> = Promise.resolve();
  let lastRunAt = 0;

  return function throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const wait = Math.max(0, lastRunAt + minIntervalMs - Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastRunAt = Date.now();
      return fn();
    });
    // Keep the queue alive even if this call fails, so one bad request
    // doesn't wedge every call queued after it.
    queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
