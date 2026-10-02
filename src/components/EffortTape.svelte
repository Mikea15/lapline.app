<!-- EffortTape.svelte - Tape's "Timeline" panel: 120 HR-encoded columns with
     an overlaid pace line, a hover/scrub tooltip, and its own scrub
     interaction that drives the shared cursor the route map and km tiles
     also read, so everything moves together in one frame. -->
<script lang="ts">
  import { buildEffortColumns } from '../lib/effort-tape';
  import { ZONE_COLORS, ZONE_NAMES, zoneIndexForHr } from '../lib/hr-zones';
  import { formatPace, formatDistance, toDisplayElevation, elevationUnit, type UnitSystem } from '../lib/units';
  import type { Lap } from '../lib/types';

  interface Props {
    t: number[];
    hr: number[];
    distance: number[];
    altitude: number[];
    pace: number[]; // per-second pace stream, min/km
    hrZoneBoundaries: number[];
    unitSystem: UnitSystem;
    formatTime: (sec: number) => string;
    scrubIndex: number | null; // for display - already has the parent's default-position fallback applied
    syncSeconds?: number | null; // bindable - the raw hover-driven shared cursor value
    // Real device laps, used only for keyboard scrubbing (design_handoff_atlas
    // README section 8.6 - "arrow keys stepping by lap") - the prototype's
    // scrub is mouse-only, this is the keyboard-accessible equivalent.
    laps?: Lap[];
    // 'large' is the non-GPS fallback (design_handoff_atlas README section
    // 8.2): this becomes the map panel's only real content instead of a
    // small overlay, so it gets a taller tape and bigger type to hold that
    // much more prominent a role.
    size?: 'compact' | 'large';
    // False when the activity has no real per-second speed data (cardio, or
    // a pool swim - its own distance/speed streams are effectively empty
    // even though its summary distance is real) - hides the overlaid pace
    // line and the readout's distance/pace fields, which would otherwise
    // show the pace stream's flat empty-data fallback value dressed up as a
    // real number (e.g. a constant "20:00 /km").
    hasDistance?: boolean;
    // False when the activity has no real HR data at all (e.g. a GPX
    // import - that format has no HR field, unlike FIT) - hides the
    // readout's HR/zone row, which would otherwise show a fake-looking
    // "0 bpm" reading rather than the "not recorded" it actually means.
    hasHr?: boolean;
    // Position (into `laps`) of the km to highlight - a shaded band over
    // that km's time span with its stretch of the pace line picked out in
    // the accent color. Null when nothing is being hovered.
    highlightLapIndex?: number | null;
    // Overrides the chart's own CSS height (px), animated - used to shrink
    // the Timeline while it's pinned under the header. Null = default.
    chartHeight?: number | null;
  }

  let {
    t,
    hr,
    distance,
    altitude,
    pace,
    hrZoneBoundaries,
    unitSystem,
    formatTime,
    scrubIndex,
    syncSeconds = $bindable(null),
    laps = [],
    size = 'compact',
    hasDistance = true,
    hasHr = true,
    highlightLapIndex = null,
    chartHeight = null
  }: Props = $props();

  const COLUMNS = 120;
  const VB_W = 1000;
  const VB_H = 100;
  const BASELINE = VB_H - 6;
  const COL_GAP = 0.6;

  let columns = $derived(buildEffortColumns(hr, hrZoneBoundaries, pace, COLUMNS));
  let colWidth = $derived(VB_W / COLUMNS);

  let paceDomain = $derived.by(() => {
    const finite = columns.map((c) => c.paceMinPerKm).filter((p): p is number => p !== null);
    if (finite.length === 0) return { lo: 0, hi: 1 };
    return { lo: Math.min(...finite), hi: Math.max(...finite) };
  });

  // Inverted: a faster (lower) pace reads higher on the tape.
  function paceY(p: number): number {
    const { lo, hi } = paceDomain;
    const span = hi - lo || 1;
    const frac = (p - lo) / span;
    return 4 + (1 - frac) * (BASELINE - 4 - 10);
  }

  let pacePoints = $derived.by(() => {
    const pts: { x: number; y: number }[] = [];
    columns.forEach((col, i) => {
      if (col.paceMinPerKm === null) return;
      pts.push({ x: (i + 0.5) * colWidth, y: paceY(col.paceMinPerKm) });
    });
    return pts;
  });

  let pacePath = $derived(pacePoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));

  let tMin = $derived(t.length > 0 ? t[0]! : 0);
  let tMax = $derived(t.length > 0 ? t[t.length - 1]! : 1);
  let tSpan = $derived(tMax - tMin || 1);

  let cursorPct = $derived.by(() => {
    if (scrubIndex === null || t.length === 0) return null;
    const sec = t[scrubIndex] ?? tMin;
    return ((sec - tMin) / tSpan) * 100;
  });

  let readout = $derived.by(() => {
    if (scrubIndex === null) return null;
    const hrVal = hr[scrubIndex] ?? 0;
    const zone = zoneIndexForHr(hrVal, hrZoneBoundaries);
    return {
      distance: distance[scrubIndex] ?? 0,
      t: t[scrubIndex] ?? 0,
      hr: hrVal,
      zoneLabel: zone >= 0 ? ZONE_NAMES[zone]! : null,
      pace: pace[scrubIndex] ?? 0,
      altitude: altitude[scrubIndex] ?? 0
    };
  });

  let highlightBand = $derived.by(() => {
    if (highlightLapIndex === null) return null;
    const lap = laps[highlightLapIndex];
    if (!lap) return null;
    const x0 = Math.max(0, ((lap.startOffsetSec - tMin) / tSpan) * VB_W);
    const x1 = Math.min(VB_W, ((lap.startOffsetSec + lap.elapsedSec - tMin) / tSpan) * VB_W);
    if (x1 <= x0) return null;
    return { x0, x1, label: `Km ${highlightLapIndex + 1}` };
  });

  const AXIS_TICKS = 5;
  let axisTicks = $derived(Array.from({ length: AXIS_TICKS }, (_, i) => tMin + (tSpan * i) / (AXIS_TICKS - 1)));

  let tapeEl = $state<HTMLDivElement | null>(null);

  function nearestSample(sec: number): number {
    let best = tMin;
    let bestDist = Infinity;
    for (const sample of t) {
      const d = Math.abs(sample - sec);
      if (d < bestDist) {
        bestDist = d;
        best = sample;
      }
    }
    return best;
  }

  // The readout tooltip only shows while the tape is actually being
  // scrubbed - pointer over it, or arrow-key lap stepping. scrubIndex
  // alone never goes null (the parent falls back to the activity start),
  // so gating on it left the tooltip stuck on screen after the mouse left
  // (bug-list.md). The cursor line itself stays visible either way.
  let pointerOver = $state(false);

  // The tooltip sits inside the chart beside the cursor - not above it,
  // where the app header would cover it while Timeline is stuck under it -
  // flipping to the cursor's left past the midpoint so it never spills off
  // either edge.
  let tooltipFlip = $derived(cursorPct !== null && cursorPct > 55);

  function handleMove(e: MouseEvent) {
    if (!tapeEl || t.length === 0) return;
    pointerOver = true;
    const rect = tapeEl.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    syncSeconds = nearestSample(tMin + frac * tSpan);
    keyboardLapIndex = null;
  }

  function handleLeave() {
    pointerOver = false;
    syncSeconds = null;
    keyboardLapIndex = null;
  }

  function handleBlur() {
    keyboardLapIndex = null;
  }

  // Tracks the lap arrow-key navigation last moved *to*, directly - not
  // re-derived from the resulting scrub time. Snapping a lap's exact
  // boundary time to the nearest actually-recorded second (nearestSample)
  // can land a second or two short of it (lap boundaries are their own FIT
  // timestamps, not guaranteed to align with the record stream's own
  // seconds), which made a time-threshold comparison here misclassify the
  // lap we'd just navigated to as the one before it - repeated ArrowRight
  // would recompute the same "next" target and get stuck. Reset to null on
  // any mouse-driven scrub, so hovering always falls back to real time.
  let keyboardLapIndex = $state<number | null>(null);
  let showReadout = $derived(pointerOver || keyboardLapIndex !== null);

  // The lap the current scrub position falls in - the last lap whose own
  // start has already passed, mirroring how RouteMap.svelte places pins at
  // each lap's cumulative boundary.
  function currentLapIndex(): number {
    if (keyboardLapIndex !== null) return keyboardLapIndex;
    const currentSec = syncSeconds ?? (scrubIndex !== null ? (t[scrubIndex] ?? tMin) : tMin);
    let idx = 0;
    laps.forEach((lap, i) => {
      if (currentSec >= lap.startOffsetSec) idx = i;
    });
    return idx;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (laps.length === 0 || t.length === 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = Math.min(laps.length - 1, currentLapIndex() + 1);
      keyboardLapIndex = nextIndex;
      syncSeconds = nearestSample(laps[nextIndex]!.startOffsetSec);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = Math.max(0, currentLapIndex() - 1);
      keyboardLapIndex = prevIndex;
      syncSeconds = nearestSample(laps[prevIndex]!.startOffsetSec);
    }
  }
</script>

<div class="effort-tape" class:effort-tape-large={size === 'large'}>
  <div
    class="effort-tape-box"
    style:height={chartHeight !== null ? `${chartHeight}px` : null}
    bind:this={tapeEl}
    onmousemove={handleMove}
    onmouseleave={handleLeave}
    onblur={handleBlur}
    onkeydown={handleKeydown}
    role="slider"
    tabindex="0"
    aria-label="Timeline: heart rate and pace over the course of the activity"
    aria-valuemin={0}
    aria-valuemax={laps.length > 0 ? laps.length - 1 : 0}
    aria-valuenow={laps.length > 0 ? currentLapIndex() : 0}
    aria-valuetext={laps.length > 0 ? `Lap ${currentLapIndex() + 1} of ${laps.length}` : undefined}
  >
    <svg viewBox="0 0 {VB_W} {VB_H}" preserveAspectRatio="none" class="effort-tape-svg" role="img" aria-label="Heart rate and pace over the course of the activity, scrub to move the route marker">
      {#if highlightBand}
        <defs>
          <clipPath id="effort-tape-highlight-clip">
            <rect x={highlightBand.x0} y="0" width={highlightBand.x1 - highlightBand.x0} height={VB_H} />
          </clipPath>
        </defs>
        <rect x={highlightBand.x0} y="0" width={highlightBand.x1 - highlightBand.x0} height={VB_H} class="effort-tape-highlight-band" />
      {/if}
      {#each columns as col, i (i)}
        {#if col.heightFrac > 0}
          <rect
            x={i * colWidth + COL_GAP / 2}
            y={BASELINE - col.heightFrac * (BASELINE - 4)}
            width={Math.max(0, colWidth - COL_GAP)}
            height={col.heightFrac * (BASELINE - 4)}
            fill={col.zone >= 0 ? ZONE_COLORS[col.zone] : 'var(--ink-6)'}
            opacity={col.opacity}
          />
        {/if}
      {/each}
      {#if hasDistance && pacePath}
        <path d={pacePath} fill="none" stroke="var(--bg-app)" stroke-width="3.4" vector-effect="non-scaling-stroke" />
        <path d={pacePath} fill="none" stroke="var(--ink-1)" stroke-width="1.4" vector-effect="non-scaling-stroke" />
        {#if highlightBand}
          <path d={pacePath} fill="none" stroke="var(--accent)" stroke-width="2.4" vector-effect="non-scaling-stroke" clip-path="url(#effort-tape-highlight-clip)" />
        {/if}
      {/if}
    </svg>
    {#if highlightBand}
      <span class="effort-tape-highlight-label mono" style="left: {(highlightBand.x0 / VB_W) * 100}%;">{highlightBand.label}</span>
    {/if}
    {#if cursorPct !== null}
      <div class="effort-tape-cursor-line" style="left: {cursorPct}%;"></div>
      <div class="effort-tape-cursor-dot" style="left: {cursorPct}%;"></div>
    {/if}
    {#if readout && cursorPct !== null && showReadout}
      <div class="chart-tooltip effort-tape-tooltip" class:flip={tooltipFlip} style="left: {cursorPct}%;">
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label">{formatTime(readout.t)}</span>
          {#if hasDistance}<span class="chart-tooltip-value">{formatDistance(readout.distance / 1000, unitSystem, 2)}</span>{/if}
        </div>
        {#if hasHr}
          <div class="chart-tooltip-row">
            <span class="chart-tooltip-label">{readout.zoneLabel ?? 'HR'}</span>
            <span class="chart-tooltip-value" style="color: var(--alert);">{readout.hr} bpm</span>
          </div>
        {/if}
        {#if hasDistance}
          <div class="chart-tooltip-row">
            <span class="chart-tooltip-label">Pace</span>
            <span class="chart-tooltip-value" style="color: var(--accent);">{formatPace(readout.pace, unitSystem)}</span>
          </div>
        {/if}
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label">Elevation</span>
          <span class="chart-tooltip-value">{Math.round(toDisplayElevation(readout.altitude, unitSystem))} {elevationUnit(unitSystem)}</span>
        </div>
      </div>
    {/if}
  </div>

  <div class="effort-tape-axis mono">
    {#each axisTicks as tick, i (i)}
      <span class:first={i === 0} class:last={i === axisTicks.length - 1}>{formatTime(tick)}</span>
    {/each}
  </div>
</div>

<style>
  .effort-tape {
    background: var(--tooltip-bg);
    border: 1px solid var(--line-panel);
    border-radius: var(--radius);
    padding: var(--space-4) var(--space-5) var(--space-3);
    backdrop-filter: blur(2px);
  }
  .effort-tape-tooltip {
    top: 6px;
    margin-top: 0;
    transform: translateX(10px);
  }
  .effort-tape-tooltip.flip {
    transform: translateX(calc(-100% - 10px));
  }
  .effort-tape-box {
    position: relative;
    height: 130px;
    transition: height 0.35s ease;
    cursor: crosshair;
    border-radius: var(--radius-sm);
  }
  .effort-tape-box:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .effort-tape-svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .effort-tape-highlight-band {
    fill: var(--accent);
    opacity: 0.12;
  }
  .effort-tape-highlight-label {
    position: absolute;
    top: 2px;
    margin-left: var(--space-2);
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--accent);
    pointer-events: none;
  }
  .effort-tape-cursor-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--accent);
    pointer-events: none;
  }
  .effort-tape-cursor-dot {
    position: absolute;
    top: -3px;
    width: 7px;
    height: 7px;
    margin-left: -3px;
    border-radius: 4px;
    background: var(--accent);
    pointer-events: none;
  }
  .effort-tape-axis {
    display: flex;
    justify-content: space-between;
    margin-top: var(--space-2);
    font-size: var(--fs-xs);
    color: var(--ink-6);
  }

  /* The non-GPS fallback (design_handoff_atlas README section 8.2): this
     becomes the map panel's only real content rather than a small overlay,
     so it fills the panel and gets a taller tape and bigger type to match. */
  .effort-tape-large {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: transparent;
    border: none;
    backdrop-filter: none;
    padding: 0 var(--space-2);
  }
  .effort-tape-large .effort-tape-tooltip {
    font-size: var(--fs-base);
  }
  .effort-tape-large .effort-tape-box {
    height: 170px;
  }
  .effort-tape-large .effort-tape-axis {
    font-size: var(--fs-xs);
  }
</style>
