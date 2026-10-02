// lib/flat-route.ts
// Flat top-down route projection for the Activity screen's "Plan" view
// (PlanRouteMap.svelte). Web Mercator, the projection map tiles use, so the
// optional map background (lib/map-tiles.ts) lines up with the route; at the
// scale of one activity it looks the same as a plain equirectangular
// projection. The route is fitted into a 1000-unit square viewBox with a
// margin, and routeFrame() also gives the linear mapping between viewBox
// units and Mercator "world" coordinates, which the tiles are placed with.

export interface Point2D {
  x: number;
  y: number;
}

export interface FlatFix {
  lat: number;
  lon: number;
}

/** Web Mercator world coordinates at zoom 0: 0-256 on both axes, y down. */
export function mercator(lat: number, lon: number): Point2D {
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const phi = (clamped * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * 256,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * 256
  };
}

/** view = world * scale + offset, on each axis. */
export interface RouteFrame {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const VB = 1000;
const MARGIN = VB * 0.08;

export function routeFrame(fixes: FlatFix[]): RouteFrame | null {
  if (fixes.length < 2) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const f of fixes) {
    const p = mercator(f.lat, f.lon);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = Math.max(maxX - minX, 1e-9);
  const h = Math.max(maxY - minY, 1e-9);
  const span = Math.max(w, h);
  const scale = (VB - MARGIN * 2) / span;
  // Centre the route's bounding box in the square.
  return {
    scale,
    offsetX: MARGIN - (minX - (span - w) / 2) * scale,
    offsetY: MARGIN - (minY - (span - h) / 2) * scale
  };
}

export function projectFlatRoute(fixes: FlatFix[]): Point2D[] | null {
  const frame = routeFrame(fixes);
  if (!frame) return null;
  return fixes.map((f) => {
    const p = mercator(f.lat, f.lon);
    return { x: p.x * frame.scale + frame.offsetX, y: p.y * frame.scale + frame.offsetY };
  });
}
