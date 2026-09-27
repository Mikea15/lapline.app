// lib/isometric.ts
// Isometric 3D route reconstruction for the Activity screen's Route panel,
// per design_handoff_atlas/README.md section 3: the same equirectangular
// ground projection as lib/geo.ts's flat map, a real per-fix elevation
// lift, and a 30-degree isometric transform, so the route reads as a
// ribbon over a ground plane instead of a flat top-down map. Replaces
// RouteMap.svelte's previous flat projection (bug-list.md).

export interface ElevatedFix {
  lat: number;
  lon: number;
  alt: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface IsometricRoute {
  viewBoxSize: number; // always 1000
  /** Elevation-lifted, isometric-transformed route - index-aligned with the input fixes. */
  track: Point2D[];
  /** The same route projected at z=0 (the floor shadow), same indexing as track. */
  floor: Point2D[];
  /** The 4 corners of the ground plane, in order, for an outer outline path. */
  groundQuad: Point2D[];
  /** Interior ground gridlines (quarter-spacing in both directions). */
  gridLines: { x1: number; y1: number; x2: number; y2: number }[];
}

// One pass of a 1-2-1 smoothing kernel. Endpoints are clamped to their own
// original value (rather than shrinking the array or wrapping), since raw
// GPS is jagged at this zoom but the route's real start/end shouldn't drift.
export function smooth121(values: number[]): number[] {
  const n = values.length;
  if (n < 3) return values.slice();
  const out = new Array<number>(n);
  out[0] = values[0]!;
  out[n - 1] = values[n - 1]!;
  for (let i = 1; i < n - 1; i++) {
    out[i] = (values[i - 1]! + 2 * values[i]! + values[i + 1]!) / 4;
  }
  return out;
}

const COS30 = Math.cos(Math.PI / 6); // ~0.8660
const SIN30 = 0.5;
// Deliberate vertical exaggeration (of the ground span) - real relief would
// otherwise be invisible at this projection's scale. Fixed per the design
// brief; making it vary per activity/sport is left as a future refinement
// (README section 8.3).
const LIFT = 0.34;

function isoXY(gx: number, gy: number, z: number): Point2D {
  return { x: (gx - gy) * COS30, y: (gx + gy) * SIN30 - z * LIFT };
}

export function projectIsometricRoute(fixes: ElevatedFix[]): IsometricRoute | null {
  if (fixes.length < 2) return null;

  let latMin = Infinity;
  let latMax = -Infinity;
  let lonMin = Infinity;
  let lonMax = -Infinity;
  let altMin = Infinity;
  let altMax = -Infinity;
  for (const f of fixes) {
    if (f.lat < latMin) latMin = f.lat;
    if (f.lat > latMax) latMax = f.lat;
    if (f.lon < lonMin) lonMin = f.lon;
    if (f.lon > lonMax) lonMax = f.lon;
    if (f.alt < altMin) altMin = f.alt;
    if (f.alt > altMax) altMax = f.alt;
  }

  const k = Math.cos((latMin * Math.PI) / 180);
  const w = Math.max((lonMax - lonMin) * k, 1e-9);
  const h = Math.max(latMax - latMin, 1e-9);
  const span = Math.max(w, h);

  let gxs = fixes.map((f) => ((f.lon - lonMin) * k + (span - w) / 2) / span);
  let gys = fixes.map((f) => (latMax - f.lat + (span - h) / 2) / span);

  // Smooth the ground points twice - raw GPS is jagged at this zoom;
  // without it the ribbon looks like noise.
  gxs = smooth121(smooth121(gxs));
  gys = smooth121(smooth121(gys));

  const altSpan = altMax - altMin;
  const zs = fixes.map((f) => (altSpan > 1e-6 ? (f.alt - altMin) / altSpan : 0));

  let track = gxs.map((gx, i) => isoXY(gx, gys[i]!, zs[i]!));
  // ...then once more, to the lifted track only (not the floor below).
  const trackXs = smooth121(track.map((p) => p.x));
  const trackYs = smooth121(track.map((p) => p.y));
  track = trackXs.map((x, i) => ({ x, y: trackYs[i]! }));

  const floor = gxs.map((gx, i) => isoXY(gx, gys[i]!, 0));

  const groundQuad = [
    { gx: 0, gy: 0 },
    { gx: 1, gy: 0 },
    { gx: 1, gy: 1 },
    { gx: 0, gy: 1 }
  ].map((c) => isoXY(c.gx, c.gy, 0));

  const gridStops = [0.25, 0.5, 0.75];
  const rawGridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const s of gridStops) {
    const a = isoXY(s, 0, 0);
    const b = isoXY(s, 1, 0);
    rawGridLines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    const c = isoXY(0, s, 0);
    const d = isoXY(1, s, 0);
    rawGridLines.push({ x1: c.x, y1: c.y, x2: d.x, y2: d.y });
  }

  // Normalise every produced layer into one shared 1000-wide viewBox with a
  // single scale, so nothing drifts between the track, the ground plane and
  // the gridlines - extra headroom at the top leaves real room for lap pins
  // (drawn by the caller) to float above the fitted track.
  const xs = [...track, ...floor, ...groundQuad].map((p) => p.x).concat(rawGridLines.flatMap((l) => [l.x1, l.x2]));
  const ys = [...track, ...floor, ...groundQuad].map((p) => p.y).concat(rawGridLines.flatMap((l) => [l.y1, l.y2]));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);

  const VB = 1000;
  const MARGIN_SIDE = VB * 0.08;
  // Just enough headroom for a lap pin (34 units tall, see RouteMap.svelte's
  // PIN_LIFT) plus its own circle - not the far larger margin a full hero's
  // floating scrub panel would need, since this is an embedded panel.
  const MARGIN_TOP = VB * 0.07;
  const MARGIN_BOTTOM = VB * 0.08;
  const availW = VB - MARGIN_SIDE * 2;
  const availH = VB - MARGIN_TOP - MARGIN_BOTTOM;
  const scale = Math.min(availW / spanX, availH / spanY);
  const offsetX = MARGIN_SIDE + (availW - spanX * scale) / 2 - minX * scale;
  const offsetY = MARGIN_TOP + (availH - spanY * scale) / 2 - minY * scale;

  const fit = (p: Point2D): Point2D => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY });

  return {
    viewBoxSize: VB,
    track: track.map(fit),
    floor: floor.map(fit),
    groundQuad: groundQuad.map(fit),
    gridLines: rawGridLines.map((l) => {
      const a = fit({ x: l.x1, y: l.y1 });
      const b = fit({ x: l.x2, y: l.y2 });
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    })
  };
}
