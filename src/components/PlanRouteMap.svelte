<!-- PlanRouteMap.svelte - flat top-down route, coloured by HR zone, for the
     Tape view's Route panel "Plan" toggle (bug-list.md). Sits alongside
     RouteMap.svelte (the isometric "Relief" view) the same way
     PoolRouteMap.svelte sits alongside it for pool swims - a separate,
     smaller component rather than branching RouteMap's own isometric-
     specific rendering (ground plane, drop stems, elevation lift) that a
     flat plan view has no use for. -->
<script lang="ts">
  import { projectFlatRoute } from '../lib/flat-route';
  import { ZONE_COLORS, zoneIndexForHr } from '../lib/hr-zones';
  import { fitViewBox, viewBoxAttr } from '../lib/view-box';
  import { lapPinFixes } from '../lib/lap-pins';
  import type { Lap } from '../lib/types';

  interface Props {
    lat: (number | null)[];
    lon: (number | null)[];
    hr: number[];
    hrZoneBoundaries: number[];
    scrubIndex: number | null;
    // Same lap pins as the Relief view (RouteMap.svelte) - one numbered
    // marker per real device lap boundary, placed from the distance stream,
    // two-way hover-linked with the km tiles through the shared lap index.
    distance?: number[];
    laps?: Lap[];
    hoveredLapIndex?: number | null;
    onHoverLap?: (index: number | null) => void;
    locationLabel?: string;
  }

  let { lat, lon, hr, hrZoneBoundaries, scrubIndex, distance = [], laps = [], hoveredLapIndex = null, onHoverLap, locationLabel }: Props = $props();

  interface Fix {
    i: number;
    lat: number;
    lon: number;
    hr: number;
  }

  let fixes = $derived.by(() => {
    const pts: Fix[] = [];
    const n = Math.min(lat.length, lon.length);
    for (let i = 0; i < n; i++) {
      const la = lat[i];
      const lo = lon[i];
      if (la !== null && la !== undefined && lo !== null && lo !== undefined) {
        pts.push({ i, lat: la, lon: lo, hr: hr[i] ?? 0 });
      }
    }
    return pts;
  });

  let points = $derived(fixes.length >= 2 ? projectFlatRoute(fixes) : null);

  function pathFor(pts: { x: number; y: number }[]): string {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  // Same consecutive-same-zone segmenting as RouteMap.svelte, so Plan and
  // Relief read as the same real zone data drawn two different ways.
  let segments = $derived.by(() => {
    if (!points) return [];
    const runs: { color: string; d: string }[] = [];
    let currentZone: number | null = null;
    let currentPts: { x: number; y: number }[] = [];
    const flush = () => {
      if (currentPts.length >= 2) {
        const color = currentZone !== null && currentZone >= 0 ? ZONE_COLORS[currentZone]! : 'var(--ink-5)';
        runs.push({ color, d: pathFor(currentPts) });
      }
    };
    fixes.forEach((f, idx) => {
      const z = zoneIndexForHr(f.hr, hrZoneBoundaries);
      const pt = points[idx]!;
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

  // Framed to the route itself rather than projectFlatRoute's whole
  // margined square, so it fills the panel (bug-list.md zoom fix).
  // Extra top room keeps the lap pins' raised heads inside the frame.
  let vb = $derived(fitViewBox(points ?? [], 0.04, 0.04));
  // Viewbox units per real screen pixel, from the SVG's rendered size and
  // the "meet" fit, so markers and labels below are sized in actual
  // pixels - readable no matter how far the framing zooms in. Falls back
  // to the fitted box's own scale before the first layout.
  let svgW = $state(0);
  let svgH = $state(0);
  let px = $derived(svgW > 0 && svgH > 0 ? 1 / Math.min(svgW / vb.w, svgH / vb.h) : vb.unit);

  let lapPins = $derived.by(() => {
    if (!points) return [];
    return lapPinFixes(fixes.map((f) => f.i), distance, laps).map((p) => ({ lapIndex: p.lapIndex, at: points[p.fixIdx]! }));
  });
  // A flat view has no elevation to lift pins off, so a short stem just
  // raises each numbered head clear of the line it marks.
  let pinLift = $derived(20 * px);

  let casingPath = $derived(points ? pathFor(points) : '');
  let startPoint = $derived(points ? points[0] : null);

  let cursorPoint = $derived.by(() => {
    if (!points || scrubIndex === null || fixes.length === 0) return null;
    let best = 0;
    let bestDist = Infinity;
    fixes.forEach((f, idx) => {
      const d = Math.abs(f.i - scrubIndex);
      if (d < bestDist) {
        bestDist = d;
        best = idx;
      }
    });
    return points[best]!;
  });

  function fmtCoord(v: number, pos: string, neg: string): string {
    return `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
  }

  // Accessibility: this default "Plan" view had no real desc at all (unlike
  // "Relief" - RouteMap.svelte - which already gets one from the Atlas
  // accessibility pass) even though colour is the only thing conveying HR
  // zone here too. Real computed data (fix count, location), not placeholder
  // copy, matching RouteMap's own description.
  let routeDescription = $derived.by(() => {
    if (!points || fixes.length === 0) return '';
    const centerLat = fixes.reduce((s, f) => s + f.lat, 0) / fixes.length;
    const centerLon = fixes.reduce((s, f) => s + f.lon, 0) / fixes.length;
    const place = locationLabel || `centred near ${fmtCoord(centerLat, 'N', 'S')}, ${fmtCoord(centerLon, 'E', 'W')}`;
    return `A top-down route, drawn as a line coloured by heart-rate zone at each point. ${fixes.length} GPS points, ${place}.`;
  });
</script>

<div class="plan-panel">
  {#if !points}
    <div class="empty-state" style="flex: 1; min-height: 290px; display: flex; align-items: center; justify-content: center;">No GPS data for this activity.</div>
  {:else}
    <div class="plan-well">
      <svg viewBox={viewBoxAttr(vb)} preserveAspectRatio="xMidYMid meet" class="plan-svg" bind:clientWidth={svgW} bind:clientHeight={svgH} role="img" aria-labelledby="plan-svg-title plan-svg-desc">
        <title id="plan-svg-title">Top-down route, coloured by heart-rate zone</title>
        <desc id="plan-svg-desc">{routeDescription}</desc>
        <path d={casingPath} fill="none" stroke="var(--bg-app)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        {#each segments as seg, i (i)}
          <path d={seg.d} fill="none" stroke={seg.color} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        {/each}
        {#each lapPins as pin (pin.lapIndex)}
          {@const active = hoveredLapIndex === pin.lapIndex}
          <circle cx={pin.at.x} cy={pin.at.y} r={(active ? 3.5 : 2.5) * px} fill={active ? 'var(--accent)' : 'var(--ink-4)'} />
          <line
            x1={pin.at.x}
            y1={pin.at.y}
            x2={pin.at.x}
            y2={pin.at.y - pinLift}
            stroke={active ? 'var(--accent)' : 'var(--ink-5)'}
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <circle
            cx={pin.at.x}
            cy={pin.at.y - pinLift}
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
            x={pin.at.x}
            y={pin.at.y - pinLift + 3.5 * px}
            text-anchor="middle"
            class="chart-axis-label mono"
            style="font-size: {10 * px}px;{active ? ' fill: var(--bg-app); font-weight: var(--fw-bold);' : ''}"
            pointer-events="none">{pin.lapIndex + 1}</text
          >
        {/each}
        {#if startPoint}
          <circle cx={startPoint.x} cy={startPoint.y} r={5 * px} fill="var(--bg-app)" stroke="var(--positive)" stroke-width="2" vector-effect="non-scaling-stroke" />
        {/if}
        {#if cursorPoint}
          <circle cx={cursorPoint.x} cy={cursorPoint.y} r={6 * px} fill="var(--accent)" stroke="var(--bg-app)" stroke-width="2" vector-effect="non-scaling-stroke" />
        {/if}
      </svg>
      <div class="plan-annotation top-right mono">plan · {fixes.length} fixes</div>
    </div>
    <div class="zone-key">
      {#each ZONE_COLORS as color, i (i)}
        <span class="zone-key-item"><span class="zone-key-swatch" style="background: {color};"></span>Z{i + 1}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .plan-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .plan-well {
    position: relative;
    flex: 1;
    min-height: 290px;
    background: var(--bg-well);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-sm);
    padding: var(--space-5);
    display: flex;
  }
  .plan-svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .plan-annotation {
    position: absolute;
    font-size: var(--fs-xs);
    line-height: 1.5;
    color: var(--ink-6);
  }
  .lap-pin-hit {
    cursor: pointer;
  }
  .top-right {
    right: 12px;
    top: 8px;
  }
</style>
