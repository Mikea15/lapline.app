// lib/hr-zones.ts
// Shared HR zone naming/coloring, used by the Time-in-Zones breakdown.

export const ZONE_NAMES = ['Warm Up', 'Easy', 'Aerobic', 'Threshold', 'Maximum'];
// Cool -> hot, matching the conventional zone-chart color progression.
export const ZONE_COLORS = ['var(--zone-1)', 'var(--zone-2)', 'var(--zone-3)', 'var(--zone-4)', 'var(--zone-5)'];
// The same zones as text on a panel (ZONE_INK) and as text on a zone fill
// (ZONE_ON) - the fills alone don't reach 4.5:1 as text in the light theme.
export const ZONE_INK = ['var(--zone-1-ink)', 'var(--zone-2-ink)', 'var(--zone-3-ink)', 'var(--zone-4-ink)', 'var(--zone-5-ink)'];
export const ZONE_ON = ['var(--zone-1-on)', 'var(--zone-2-on)', 'var(--zone-3-on)', 'var(--zone-4-on)', 'var(--zone-5-on)'];

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
