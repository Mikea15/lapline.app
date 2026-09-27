// lib/geo.ts
// Shared GPS-fix helpers. The flat equirectangular route projection that
// used to live here was replaced by lib/isometric.ts's isometric 3D
// reconstruction (bug-list.md, design_handoff_atlas) - this file now only
// holds firstFix, which lib/geocode.ts, lib/weather.ts and RouteMap.svelte
// all still need to find an activity's real start coordinate.

export interface GeoFix {
  lat: number;
  lon: number;
}

// The first fix with both lat and lon present - some records in a GPS
// stream can be null (e.g. a brief loss of signal), so this isn't just
// index 0. Shared by lib/geocode.ts and lib/weather.ts (via ActivityScreen)
// so both look up from the same real start coordinate.
export function firstFix(lat: (number | null)[], lon: (number | null)[]): GeoFix | null {
  const n = Math.min(lat.length, lon.length);
  for (let i = 0; i < n; i++) {
    const la = lat[i];
    const lo = lon[i];
    if (la != null && lo != null) return { lat: la, lon: lo };
  }
  return null;
}
