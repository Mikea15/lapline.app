// scripts/perf/lib/timeit.ts
// Minimal timing harness shared by the perf-report benchmarks. Runs a
// function repeatedly and reports the median (not the mean) since a single
// slow outlier - a GC pause, JIT warmup on the first call - would otherwise
// skew a small sample far more than it should.

export interface TimingResult {
  name: string;
  unit: 'ms';
  medianMs: number;
  minMs: number;
  maxMs: number;
  iterations: number;
}

export interface TimeitOptions {
  iterations?: number;
  warmup?: number;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

// For benchmarks whose samples come from an external loop (e.g. one full
// Playwright flow per iteration) rather than from timeitAsync's own loop.
export function summarize(name: string, samplesMs: number[]): TimingResult {
  return {
    name,
    unit: 'ms',
    medianMs: median(samplesMs),
    minMs: Math.min(...samplesMs),
    maxMs: Math.max(...samplesMs),
    iterations: samplesMs.length
  };
}

export async function timeitAsync(
  name: string,
  fn: () => Promise<unknown> | unknown,
  { iterations = 10, warmup = 2 }: TimeitOptions = {}
): Promise<TimingResult> {
  for (let i = 0; i < warmup; i++) await fn();
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  return summarize(name, samples);
}
