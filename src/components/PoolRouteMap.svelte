<!-- PoolRouteMap.svelte - pool swimming's stand-in for RouteMap: a pool-swim
     activity has no GPS (indoor), so there's no real route to draw. Instead
     of leaving the Route panel empty, this draws a schematic pool with one
     row per length, alternating direction (the swimmer turning at each
     wall) to represent the real back-and-forth of lap swimming over time -
     it's an illustrative layout, not a real position, but the coloring is
     real: each active length's line is colored by that length's own real
     average heart rate (from the activity's per-second HR stream, sliced to
     that length's time window), same zone-color convention as RouteMap.
     Rest lengths show as a small grey pause marker instead of a line, since
     no distance was actually covered. -->
<script lang="ts">
  import type { SwimLength } from '../lib/types';
  import { ZONE_COLORS, zoneIndexForHr } from '../lib/hr-zones';

  interface Props {
    lengths: SwimLength[];
    t: number[];
    hr: number[];
    hrZoneBoundaries: number[];
    poolLengthM: number;
    scrubIndex: number | null;
  }

  let { lengths, t, hr, hrZoneBoundaries, poolLengthM, scrubIndex }: Props = $props();

  const VB_W = 1000;
  const VB_H = 560;
  const M_LEFT = 60;
  const M_RIGHT = 60;
  const M_TOP = 30;
  const M_BOTTOM = 30;
  const PLOT_W = VB_W - M_LEFT - M_RIGHT;
  const PLOT_H = VB_H - M_TOP - M_BOTTOM;

  // Real average HR within a length's own time window, not a fake value -
  // a simple linear scan is fine here (lengths and t are both chronological,
  // and even a long swim is at most a few hundred lengths over a few
  // thousand per-second samples).
  function avgHrForLength(l: SwimLength): number {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < t.length; i++) {
      const ti = t[i]!;
      if (ti < l.startOffsetSec) continue;
      if (ti >= l.startOffsetSec + l.elapsedSec) break;
      const h = hr[i] ?? 0;
      if (h > 0) {
        sum += h;
        n++;
      }
    }
    return n > 0 ? sum / n : 0;
  }

  interface Row {
    y: number;
    active: boolean;
    color: string;
    x1: number;
    x2: number;
  }

  let rows = $derived.by(() => {
    if (lengths.length === 0) return [];
    const rowH = PLOT_H / lengths.length;
    return lengths.map((l, i): Row => {
      const y = M_TOP + (i + 0.5) * rowH;
      const leftToRight = i % 2 === 0;
      const xStart = leftToRight ? M_LEFT : VB_W - M_RIGHT;
      const xEnd = leftToRight ? VB_W - M_RIGHT : M_LEFT;
      if (!l.active) {
        return { y, active: false, color: 'var(--ink-6)', x1: xStart, x2: xStart };
      }
      const zone = zoneIndexForHr(avgHrForLength(l), hrZoneBoundaries);
      const color = zone >= 0 ? ZONE_COLORS[zone]! : 'var(--ink-5)';
      return { y, active: true, color, x1: xStart, x2: xEnd };
    });
  });

  let hasLengths = $derived(lengths.length > 0);

  // Maps the shared scrub cursor (a second-index into the activity's own
  // per-second streams, from Synchronised Streams) to a position along
  // whichever length row that moment falls inside - only active lengths
  // have a real position to show a cursor at.
  let cursor = $derived.by(() => {
    if (scrubIndex === null || rows.length === 0) return null;
    const scrubT = t[scrubIndex];
    if (scrubT === undefined) return null;
    for (let i = 0; i < lengths.length; i++) {
      const l = lengths[i]!;
      const row = rows[i]!;
      if (!row.active || l.elapsedSec <= 0) continue;
      if (scrubT < l.startOffsetSec || scrubT >= l.startOffsetSec + l.elapsedSec) continue;
      const frac = (scrubT - l.startOffsetSec) / l.elapsedSec;
      const x = row.x1 + (row.x2 - row.x1) * frac;
      return { x, y: row.y };
    }
    return null;
  });

  // Rest lengths have no real position to move a cursor along (the marker
  // above only ever draws for an active row), so scrubbing through a rest
  // stretch previously showed no scrub feedback in this panel at all - the
  // moving accent dot just vanished for the whole pause. Highlights the
  // rest dot itself instead: real elapsed time, even at a standstill, is
  // still real time in the activity worth showing where the scrub position
  // currently is.
  let scrubRestRowIndex = $derived.by(() => {
    if (scrubIndex === null || lengths.length === 0) return null;
    const scrubT = t[scrubIndex];
    if (scrubT === undefined) return null;
    for (let i = 0; i < lengths.length; i++) {
      const l = lengths[i]!;
      if (l.active) continue;
      if (scrubT >= l.startOffsetSec && scrubT < l.startOffsetSec + l.elapsedSec) return i;
    }
    return null;
  });
</script>

<div class="route-panel">
  {#if !hasLengths}
    <div class="empty-state" style="flex: 1; min-height: 290px; display: flex; align-items: center; justify-content: center;">No length data for this activity.</div>
  {:else}
    <div class="route-well">
      <svg viewBox="0 0 {VB_W} {VB_H}" preserveAspectRatio="xMidYMid meet" class="route-svg" role="img" aria-label="Schematic pool, coloured by heart-rate zone per length">
        <rect x={M_LEFT - 10} y={M_TOP - 10} width={PLOT_W + 20} height={PLOT_H + 20} rx="8" fill="var(--bg-well)" stroke="var(--line-soft)" />
        <line x1={M_LEFT} y1={M_TOP - 10} x2={M_LEFT} y2={M_TOP + PLOT_H + 10} stroke="var(--ink-6)" stroke-width="2" vector-effect="non-scaling-stroke" />
        <line x1={VB_W - M_RIGHT} y1={M_TOP - 10} x2={VB_W - M_RIGHT} y2={M_TOP + PLOT_H + 10} stroke="var(--ink-6)" stroke-width="2" vector-effect="non-scaling-stroke" />
        {#each rows as row, i (i)}
          {#if row.active}
            <line x1={row.x1} y1={row.y} x2={row.x2} y2={row.y} stroke={row.color} stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" />
          {:else if scrubRestRowIndex === i}
            <circle cx={row.x1} cy={row.y} r="6" fill="var(--bg-app)" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke" />
          {:else}
            <circle cx={row.x1} cy={row.y} r="4" fill="var(--bg-app)" stroke={row.color} stroke-width="2" vector-effect="non-scaling-stroke" />
          {/if}
        {/each}
        {#if cursor}
          <circle cx={cursor.x} cy={cursor.y} r="6" fill="var(--accent)" stroke="var(--bg-app)" stroke-width="2" vector-effect="non-scaling-stroke" />
        {/if}
      </svg>
      {#if poolLengthM > 0}
        <div class="route-annotation bottom-left mono">{poolLengthM}m pool · {lengths.length} lengths</div>
      {/if}
    </div>
    <div class="zone-key">
      {#each ZONE_COLORS as color, i (i)}
        <span class="zone-key-item"><span class="zone-key-swatch" style="background: {color};"></span>Z{i + 1}</span>
      {/each}
      <span class="zone-key-item"><span class="zone-key-swatch" style="background: var(--ink-6);"></span>Rest</span>
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
    color: var(--ink-5);
  }
  .bottom-left {
    left: 12px;
    bottom: 8px;
  }
</style>
