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

// Wraps a lookup whose `null` result means "failed for now, try again later"
// (offline, rate-limited, data not published yet) as opposed to a real
// answer. Concurrent calls for the same key share one request, and a key
// that just came back null isn't re-queried until cooldownMs has passed, so
// reopening an activity (or the screen re-running its effect) doesn't hammer
// the provider. Session-only: a page reload retries straight away.
export function createRetryGate<T>(cooldownMs: number) {
  const inFlight = new Map<string, Promise<T | null>>();
  const failedAt = new Map<string, number>();

  return function gated(key: string, fn: () => Promise<T | null>): Promise<T | null> {
    const pending = inFlight.get(key);
    if (pending) return pending;
    const last = failedAt.get(key);
    if (last !== undefined && Date.now() - last < cooldownMs) return Promise.resolve(null);

    const run = fn().then((result) => {
      if (result === null) failedAt.set(key, Date.now());
      else failedAt.delete(key);
      return result;
    });
    inFlight.set(key, run);
    const clear = () => {
      inFlight.delete(key);
    };
    run.then(clear, clear);
    return run;
  };
}
