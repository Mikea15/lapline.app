// lib/flat-route.ts
// Flat top-down equirectangular route projection for the Tape view's "Plan"
// toggle (bug-list.md) - the isometric 3D reconstruction (lib/isometric.ts)
// replaced this app's old flat map during the Atlas rebuild, and that old
// implementation was deleted outright rather than kept dead in the tree.
// This is a fresh, smaller version: just the ground projection, fit into a
// shared viewBox, with none of the elevation lift/ground-plane/gridline
// machinery isometric routes need - "Plan" is a plain top-down line, not a
// 3D scene.

export interface Point2D {
  x: number;
  y: number;
}

export interface FlatFix {
  lat: number;
  lon: number;
}

export function projectFlatRoute(fixes: FlatFix[]): Point2D[] | null {
  if (fixes.length < 2) return null;

  let latMin = Infinity;
  let latMax = -Infinity;
  let lonMin = Infinity;
  let lonMax = -Infinity;
  for (const f of fixes) {
    if (f.lat < latMin) latMin = f.lat;
    if (f.lat > latMax) latMax = f.lat;
    if (f.lon < lonMin) lonMin = f.lon;
    if (f.lon > lonMax) lonMax = f.lon;
  }

  // Equirectangular: longitude scaled by cos(latitude) so the projection
  // isn't stretched east-west away from the equator.
  const k = Math.cos((latMin * Math.PI) / 180);
  const w = Math.max((lonMax - lonMin) * k, 1e-9);
  const h = Math.max(latMax - latMin, 1e-9);
  const span = Math.max(w, h);

  const raw = fixes.map((f) => ({
    x: ((f.lon - lonMin) * k + (span - w) / 2) / span,
    y: (latMax - f.lat + (span - h) / 2) / span // screen y grows downward, so north (higher lat) is smaller y
  }));

  const VB = 1000;
  const MARGIN = VB * 0.08;
  const avail = VB - MARGIN * 2;

  return raw.map((p) => ({ x: MARGIN + p.x * avail, y: MARGIN + p.y * avail }));
}
