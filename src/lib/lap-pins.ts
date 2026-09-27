// lib/lap-pins.ts
// Where each real device lap ends along a GPS route - shared by the Route
// panel's Relief (RouteMap.svelte) and Plan (PlanRouteMap.svelte) views so
// both put their numbered lap pins in exactly the same place. One pin per
// real device lap boundary (not an even km split), so pins share one
// identity token (lap.index) with the km tiles for two-way hover linking.

import type { Lap } from './types';

export interface LapPin {
  lapIndex: number; // the lap's own index, as used by hoveredLapIndex
  fixIdx: number; // index into the caller's GPS fix array
}

/** `fixStreamIndex[k]` is fix k's index into the per-second `distance`
 *  stream. Each pin lands on the first fix whose cumulative distance
 *  reaches that lap's cumulative distance total. */
export function lapPinFixes(fixStreamIndex: number[], distance: number[], laps: Lap[]): LapPin[] {
  if (fixStreamIndex.length === 0 || laps.length === 0) return [];
  const pins: LapPin[] = [];
  let cumulativeM = 0;
  let searchFrom = 0;
  for (const lap of laps) {
    cumulativeM += lap.distanceM;
    let foundIdx = -1;
    for (let idx = searchFrom; idx < fixStreamIndex.length; idx++) {
      if ((distance[fixStreamIndex[idx]!] ?? 0) >= cumulativeM) {
        foundIdx = idx;
        break;
      }
    }
    // The last lap's cumulative distance can exceed the last real GPS
    // fix's own distance by a hair (e.g. a final few metres recorded after
    // the last fix) - clamp to the last fix rather than dropping that
    // lap's pin, so every km tile still has one.
    if (foundIdx < 0) foundIdx = fixStreamIndex.length - 1;
    pins.push({ lapIndex: lap.index, fixIdx: foundIdx });
    searchFrom = foundIdx;
  }
  return pins;
}
