<!-- RouteMap.svelte - isometric 3D route reconstruction, per
     design_handoff_atlas/README.md section 3: an equirectangular ground
     projection, a real per-fix elevation lift, and a 30-degree isometric
     transform (lib/isometric.ts), replacing the previous flat top-down map.
     The cursor marker follows the same `scrubIndex` the synchronized stream
     tracks use, so scrubbing any stream moves this marker too. -->
<script lang="ts">
  import { projectIsometricRoute } from '../lib/isometric';
  import { fitViewBox, viewBoxAttr } from '../lib/view-box';
  import { lapPinFixes } from '../lib/lap-pins';
  import { ZONE_COLORS, zoneIndexForHr } from '../lib/hr-zones';
  import type { Lap } from '../lib/types';

  interface Props {
    lat: (number | null)[];
    lon: (number | null)[];
    hr: number[];
    altitude: number[];
    distance: number[];
    hrZoneBoundaries: number[];
    scrubIndex: number | null;
    // Real device laps (fit-parser.ts), used to place one pin per lap
    // boundary rather than an arbitrary even split - see lapPins below.
    laps?: Lap[];
    // Two-way hover link with the Splits table (design_handoff_atlas
    // README.md sections 5a/8.4): shared with it via the same lap index, so
    // hovering either a pin here or a row there highlights both at once.
    hoveredLapIndex?: number | null;
    onHoverLap?: (index: number | null) => void;
    // Reverse-geocoded place name (lib/geocode.ts), shown instead of the
    // raw coordinates once resolved - undefined (not yet looked up, or the
    // opt-in Settings toggle is off) and '' (looked up, nothing found) both
    // fall back to the coordinates.
    locationLabel?: string;
  }

  let { lat, lon, hr, altitude, distance, hrZoneBoundaries, scrubIndex, laps = [], hoveredLapIndex = null, onHoverLap, locationLabel }: Props = $props();

  interface Fix {
    i: number; // index into the original per-second streams (hr/altitude/distance)
    lat: number;
    lon: number;
    hr: number;
    alt: number;
  }

  let fixes = $derived.by(() => {
    const pts: Fix[] = [];
    const n = Math.min(lat.length, lon.length);
    for (let i = 0; i < n; i++) {
      const la = lat[i];
      const lo = lon[i];
      if (la !== null && la !== undefined && lo !== null && lo !== undefined) {
        pts.push({ i, lat: la, lon: lo, hr: hr[i] ?? 0, alt: altitude[i] ?? 0 });
      }
    }
    return pts;
  });

  let iso = $derived(fixes.length >= 2 ? projectIsometricRoute(fixes) : null);

  function zoneIndex(hrVal: number): number {
    return zoneIndexForHr(hrVal, hrZoneBoundaries);
  }

  // Consecutive same-zone runs; each run's path repeats the previous run's
  // last point so segments join with no visible gap.
  let segments = $derived.by(() => {
    if (!iso) return [];
    const runs: { color: string; d: string }[] = [];
    let currentZone: number | null = null;
    let currentPts: { x: number; y: number }[] = [];
    const flush = () => {
      if (currentPts.length >= 2) {
        const color = currentZone !== null && currentZone >= 0 ? ZONE_COLORS[currentZone]! : 'var(--ink-5)';
        runs.push({ color, d: currentPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') });
      }
    };
    fixes.forEach((f, idx) => {
      const z = zoneIndex(f.hr);
      const pt = iso.track[idx]!;
      if (z !== currentZone) {
        flush();
        currentPts = currentPts.length > 0 ? [currentPts[currentPts.length - 1]!, pt] : [pt];
        currentZone = z;
      } else {
        currentPts.push(pt);
      }
    });
    flush();
    return runs;
  });

  function pathFor(points: { x: number; y: number }[]): string {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  let casingPath = $derived(iso ? pathFor(iso.track) : '');
  let floorPath = $derived(iso ? pathFor(iso.floor) : '');
  let groundQuadPath = $derived(iso ? pathFor(iso.groundQuad) + ' Z' : '');
  let startPoint = $derived(iso ? iso.track[0] : null);

  // Every 26th fix, a drop stem from the lifted track down to its own floor
  // shadow - a depth cue, not a data value (design_handoff_atlas §3 draw
  // order #3).
  let dropStems = $derived.by(() => {
    if (!iso) return [];
    const stems: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let idx = 0; idx < fixes.length; idx += 26) {
      const track = iso.track[idx]!;
      const floor = iso.floor[idx]!;
      stems.push({ x1: track.x, y1: track.y, x2: floor.x, y2: floor.y });
    }
    return stems;
  });

  // One pin per real device lap boundary, shared with Plan view
  // (lib/lap-pins.ts) so both views put pins in the same place.
  let lapPins = $derived.by(() => {
    if (!iso) return [];
    return lapPinFixes(fixes.map((f) => f.i), distance, laps).map((p) => ({ lapIndex: p.lapIndex, track: iso.track[p.fixIdx]!, floor: iso.floor[p.fixIdx]! }));
  });

  // Framed to the drawn scene (ground plane + lifted track + its floor
  // shadow) rather than the projection's whole 1000 square, so the scene
  // fills the panel (bug-list.md zoom fix). The extra top room keeps the
  // lap pins' raised heads inside the frame.
  let vb = $derived(iso ? fitViewBox([...iso.groundQuad, ...iso.track, ...iso.floor], 0.03, 0.06) : fitViewBox([]));
  // Viewbox units per real screen pixel, from the SVG's rendered size and
  // the "meet" fit, so markers and labels below are sized in actual
  // pixels - readable no matter how far the framing zooms in. Falls back
  // to the fitted box's own scale before the first layout.
  let svgW = $state(0);
  let svgH = $state(0);
  let px = $derived(svgW > 0 && svgH > 0 ? 1 / Math.min(svgW / vb.w, svgH / vb.h) : vb.unit);
  let pinLift = $derived(20 * px); // how far the pin head floats above its track point

  let cursorPoint = $derived.by(() => {
    if (!iso || scrubIndex === null || fixes.length === 0) return null;
    let best = 0;
    let bestDist = Infinity;
    fixes.forEach((f, idx) => {
      const d = Math.abs(f.i - scrubIndex);
      if (d < bestDist) {
        bestDist = d;
        best = idx;
      }
    });
    return iso.track[best]!;
  });

  let center = $derived.by(() => {
    if (fixes.length === 0) return { lat: 0, lon: 0 };
    let latMin = Infinity,
      latMax = -Infinity,
      lonMin = Infinity,
      lonMax = -Infinity;
    for (const f of fixes) {
      if (f.lat < latMin) latMin = f.lat;
      if (f.lat > latMax) latMax = f.lat;
      if (f.lon < lonMin) lonMin = f.lon;
      if (f.lon > lonMax) lonMax = f.lon;
    }
    return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 };
  });

  let elevationRange = $derived.by(() => {
    if (fixes.length === 0) return null;
    let min = Infinity,
      max = -Infinity;
    for (const f of fixes) {
      if (f.alt < min) min = f.alt;
      if (f.alt > max) max = f.alt;
    }
    return { min: Math.round(min), max: Math.round(max) };
  });

  function fmtCoord(v: number, pos: string, neg: string): string {
    return `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
  }

  // Accessibility (design_handoff_atlas README section 8.7): a real
  // description of the route, not just the generic <title> - colour is the
  // only thing conveying HR zone in the visual, so this at minimum names
  // that the ribbon is zone-coloured; everything else is real computed data
  // (fix count, elevation, laps), not placeholder copy.
  let routeDescription = $derived.by(() => {
    if (!iso) return '';
    const parts = [`${fixes.length} GPS points`];
    if (elevationRange) parts.push(`elevation ${elevationRange.min} to ${elevationRange.max} metres`);
    if (lapPins.length > 0) parts.push(`${lapPins.length} lap ${lapPins.length === 1 ? 'marker' : 'markers'}`);
    parts.push(locationLabel || `centred near ${fmtCoord(center.lat, 'N', 'S')}, ${fmtCoord(center.lon, 'E', 'W')}`);
    return `An isometric 3D reconstruction of the route, drawn as a ribbon coloured by heart-rate zone at each point. ${parts.join(', ')}.`;
  });
</script>

<div class="route-panel">
  {#if !iso}
    <div class="empty-state" style="flex: 1; min-height: 290px; display: flex; align-items: center; justify-content: center;">No GPS data for this activity.</div>
  {:else}
    <div class="route-well">
      <svg viewBox={viewBoxAttr(vb)} preserveAspectRatio="xMidYMid meet" class="route-svg" bind:clientWidth={svgW} bind:clientHeight={svgH} role="img" aria-labelledby="route-svg-title route-svg-desc">
        <title id="route-svg-title">Isometric 3D reconstruction of the GPS route</title>
        <desc id="route-svg-desc">{routeDescription}</desc>
        <!-- Ground plane -->
        <path d={groundQuadPath} fill="none" stroke="var(--line-soft)" stroke-width="1" vector-effect="non-scaling-stroke" />
        {#each iso.gridLines as g, i (i)}
          <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="var(--line-row)" stroke-width="1" vector-effect="non-scaling-stroke" />
        {/each}
        <!-- Floor shadow -->
        <path d={floorPath} fill="none" stroke="var(--line-soft)" stroke-width="1" vector-effect="non-scaling-stroke" />
        <!-- Drop stems -->
        {#each dropStems as s, i (i)}
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="var(--line-row)" stroke-width="1" vector-effect="non-scaling-stroke" />
        {/each}
        <!-- Track casing (dark halo behind the coloured ribbon) -->
        <path d={casingPath} fill="none" stroke="var(--bg-app)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        {#each segments as seg, i (i)}
          <path d={seg.d} fill="none" stroke={seg.color} stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        {/each}
        <!-- Lap pins (one per real device lap) -->
        {#each lapPins as pin (pin.lapIndex)}
          {@const active = hoveredLapIndex === pin.lapIndex}
          <line
            x1={pin.track.x}
            y1={pin.track.y}
            x2={pin.floor.x}
            y2={pin.floor.y}
            stroke={active ? 'var(--accent)' : 'var(--ink-6)'}
            stroke-width="1"
            stroke-dasharray="2.5 2"
            vector-effect="non-scaling-stroke"
          />
          <circle cx={pin.track.x} cy={pin.track.y} r={(active ? 3.5 : 2.5) * px} fill={active ? 'var(--accent)' : 'var(--ink-4)'} vector-effect="non-scaling-stroke" />
          <line
            x1={pin.track.x}
            y1={pin.track.y}
            x2={pin.track.x}
            y2={pin.track.y - pinLift}
            stroke={active ? 'var(--accent)' : 'var(--ink-5)'}
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <circle
            cx={pin.track.x}
            cy={pin.track.y - pinLift}
            r={(active ? 10 : 9) * px}
            fill={active ? 'var(--accent)' : 'var(--bg-well)'}
            stroke={active ? 'var(--accent)' : 'var(--ink-4)'}
            stroke-width="1"
            vector-effect="non-scaling-stroke"
            class="lap-pin-hit"
            role="button"
            tabindex="0"
            aria-label="Lap {pin.lapIndex + 1}"
            onmouseenter={() => onHoverLap?.(pin.lapIndex)}
            onmouseleave={() => onHoverLap?.(null)}
          />
          <text
            x={pin.track.x}
            y={pin.track.y - pinLift + 3.5 * px}
            text-anchor="middle"
            class="chart-axis-label mono"
            style="font-size: {10 * px}px;{active ? ' fill: var(--bg-app); font-weight: var(--fw-bold);' : ''}"
            pointer-events="none">{pin.lapIndex + 1}</text
          >
        {/each}
        {#if startPoint}
          <circle cx={startPoint.x} cy={startPoint.y} r={4 * px} fill="var(--bg-app)" stroke="var(--positive)" stroke-width="2" vector-effect="non-scaling-stroke" />
        {/if}
        {#if cursorPoint}
          <circle cx={cursorPoint.x} cy={cursorPoint.y} r={5 * px} fill="var(--accent)" stroke="var(--bg-app)" stroke-width="2" vector-effect="non-scaling-stroke" />
        {/if}
      </svg>
      <div class="route-annotation bottom-left mono">
        {#if locationLabel}
          {locationLabel}
        {:else}
          {fmtCoord(center.lat, 'N', 'S')}, {fmtCoord(center.lon, 'E', 'W')}
        {/if}
        {#if elevationRange}
          <br />elevation min: {elevationRange.min} m, max: {elevationRange.max} m
        {/if}
      </div>
      <div class="route-annotation top-right mono">isometric reconstruction</div>
    </div>
    <div class="zone-key">
      {#each ZONE_COLORS as color, i (i)}
        <span class="zone-key-item"><span class="zone-key-swatch" style="background: {color};"></span>Z{i + 1}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .route-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .route-well {
    position: relative;
    flex: 1;
    min-height: 290px;
    background: var(--bg-well);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-sm);
    padding: var(--space-5);
    display: flex;
  }
  .route-svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .route-annotation {
    position: absolute;
    font-size: var(--fs-xs);
    line-height: 1.5;
    color: var(--ink-6);
  }
  .bottom-left {
    left: 12px;
    bottom: 8px;
  }
  .top-right {
    right: 12px;
    top: 8px;
  }
  .lap-pin-hit {
    cursor: pointer;
  }
</style>
