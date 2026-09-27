// lib/view-box.ts
// Tight SVG viewBox framing for the route maps (bug-list.md: "Route Chart
// could be zoomed in a bit. Same for Relief."). Both route projections lay
// the route out in a fixed 1000x1000 square with generous margins, which
// left it small inside the wide Route panel - Relief especially, where the
// isometric scene only fills the middle of that square. Framing the
// viewBox to what's actually drawn lets the SVG's own "meet" scaling zoom
// the route up to fill the panel.

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Viewbox units per unit of the original 1000-wide square - multiply
   *  any fixed viewBox-unit size (marker radius, label size) by this to
   *  keep it the same on-screen size it had before the zoom. */
  unit: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** Bounding box of `points`, padded by `padFrac` of its larger side (and
 *  `extraTopFrac` more on top, for markers that rise above their point). */
export function fitViewBox(points: Pt[], padFrac = 0.05, extraTopFrac = 0): ViewBox {
  if (points.length === 0) return { x: 0, y: 0, w: 1000, h: 1000, unit: 1 };
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const p of points) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  // A degenerate (single-point / straight-line) route still gets a sane box.
  const size = Math.max(xMax - xMin, yMax - yMin, 1);
  const pad = size * padFrac;
  const top = size * extraTopFrac;
  const x = xMin - pad;
  const y = yMin - pad - top;
  const w = xMax - xMin + pad * 2;
  const h = yMax - yMin + pad * 2 + top;
  return { x, y, w, h, unit: Math.max(w, h) / 1000 };
}

export function viewBoxAttr(vb: ViewBox): string {
  return `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`;
}
