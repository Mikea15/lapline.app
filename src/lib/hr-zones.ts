// lib/hr-zones.ts
// Shared HR zone naming/coloring, used by the Time-in-Zones breakdown.

export const ZONE_NAMES = ['Warm Up', 'Easy', 'Aerobic', 'Threshold', 'Maximum'];
// Cool -> hot, matching the conventional zone-chart color progression.
export const ZONE_COLORS = ['var(--zone-1)', 'var(--zone-2)', 'var(--zone-3)', 'var(--zone-4)', 'var(--zone-5)'];

// hrZoneBoundaries holds each zone's *floor* bpm - the highest zone whose
// floor a reading has reached or passed is the zone it's in. Below every
// floor (rare - most zone configs start Z1 near resting HR) or a missing
// zone config returns -1 ("no zone"), same as an unconfigured device.
// Shared by RouteMap (per-GPS-point) and PoolRouteMap (per-length).
export function zoneIndexForHr(hrVal: number, hrZoneBoundaries: number[]): number {
  if (hrZoneBoundaries.length !== 5) return -1;
  for (let z = 4; z >= 0; z--) {
    if (hrVal >= hrZoneBoundaries[z]!) return z;
  }
  return -1;
}
