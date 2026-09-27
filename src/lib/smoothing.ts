// lib/smoothing.ts
// Centered moving average for noisy per-second record data (GPS-derived
// pace/speed/elevation especially). The window shrinks at the array's edges
// rather than padding with a fabricated value, so the first/last points
// aren't dragged toward zero.

export function smooth(values: number[], windowSize = 11): number[] {
  if (windowSize <= 1 || values.length === 0) return values;
  const half = Math.floor(windowSize / 2);
  return values.map((_, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += values[j]!;
    return sum / (hi - lo + 1);
  });
}
