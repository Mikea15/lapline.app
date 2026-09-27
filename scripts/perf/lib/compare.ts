// scripts/perf/lib/compare.ts - baseline comparison for regression flagging.

export interface MetricComparison {
  name: string;
  unit: string;
  current: number;
  previous: number | null;
  deltaPct: number | null; // positive = got worse, for either direction
  regression: boolean;
}

export interface CompareOptions {
  // 'lowerIsBetter' for timings/bytes (the common case); 'higherIsBetter'
  // for a metric where more is good (none currently tracked, but the sign
  // convention below only makes sense if this is explicit).
  direction: 'lowerIsBetter' | 'higherIsBetter';
  thresholdPct: number; // flag as a regression once |deltaPct| exceeds this AND it's a move in the bad direction
  // A percentage threshold alone flags noise on metrics that are near zero -
  // a function that takes 0.01ms either way can "regress" by 300% from a
  // single scheduler hiccup. Requiring the absolute change to also clear
  // this floor keeps the regression list meaningful.
  minAbsoluteDelta?: number;
}

export function compareMetric(
  name: string,
  unit: string,
  current: number,
  previous: number | undefined | null,
  { direction, thresholdPct, minAbsoluteDelta = 0 }: CompareOptions
): MetricComparison {
  if (previous === undefined || previous === null || previous === 0) {
    return { name, unit, current, previous: previous ?? null, deltaPct: null, regression: false };
  }
  const rawDeltaPct = ((current - previous) / previous) * 100;
  const worseDeltaPct = direction === 'lowerIsBetter' ? rawDeltaPct : -rawDeltaPct;
  return {
    name,
    unit,
    current,
    previous,
    deltaPct: rawDeltaPct,
    regression: worseDeltaPct > thresholdPct && Math.abs(current - previous) >= minAbsoluteDelta
  };
}
