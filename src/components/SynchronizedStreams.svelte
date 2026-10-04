<!-- SynchronizedStreams.svelte - the Activity detail's per-second stream
     stack, styled to match the design handoff: compact tracks (no axis
     ticks, just a min/max label pinned at each corner), a track title
     colored to match its own line, a caller-supplied summary stat, one
     scrub cursor spanning the whole stack, and one shared time axis at the
     bottom instead of a repeated one per track. Every track renders at the
     same heightPx, and hovering shows that track's own value at the cursor
     in a small floating tooltip, not just the shared readout above. -->
<script lang="ts">
  interface Band {
    y0: number;
    y1: number;
    color: string;
    opacity?: number;
  }

  export interface Track {
    key: string;
    label: string;
    unit: string;
    color: string;
    values: number[]; // one per `t` sample; NaN/undefined entries are skipped, 0 is a real value
    heightPx: number; // all tracks in a stack share the same value, so they render at equal height
    invertY?: boolean; // "lower is better" (pace): higher data value plots lower on screen
    yMin?: number;
    yMax?: number;
    bands?: Band[]; // background bands, in data units (e.g. HR zones)
    summary: string; // e.g. "avg 152 · max 180" - meaning varies per track, caller decides
    formatY: (v: number) => string; // bare corner-label text, no unit (the header already states it)
    /** 'scatter' plots each sample as an isolated dot instead of a connected
     * line/area - for a stream like cadence whose value jumps discretely
     * (e.g. footstrike steps), a connected line implies a smooth transition
     * between readings that isn't really there. */
    mode?: 'line' | 'scatter';
  }

  interface Props {
    t: number[];
    tracks: Track[];
    formatTime: (sec: number) => string;
    syncSeconds?: number | null;
  }

  let { t, tracks, formatTime, syncSeconds = $bindable(null) }: Props = $props();

  const VB_W = 1000;

  let tMin = $derived(t.length > 0 ? t[0]! : 0);
  let tMax = $derived(t.length > 0 ? t[t.length - 1]! : 1);
  let tSpan = $derived(tMax - tMin || 1);

  function px(sec: number): number {
    return ((sec - tMin) / tSpan) * VB_W;
  }

  function domain(track: Track): { lo: number; hi: number } {
    const finite = track.values.filter((v) => Number.isFinite(v));
    const dataLo = finite.length > 0 ? Math.min(...finite) : 0;
    const dataHi = finite.length > 0 ? Math.max(...finite) : 1;
    return { lo: track.yMin ?? dataLo, hi: track.yMax ?? dataHi };
  }

  // Mirrors the handoff's own mapping: a small 2px inset top/bottom so the
  // line never touches the track's own border.
  function yPixel(v: number, height: number, lo: number, hi: number, invert: boolean): number {
    const span = hi - lo || 1;
    const frac = (Math.max(lo, Math.min(hi, v)) - lo) / span;
    return height - (invert ? 1 - frac : frac) * (height - 4) - 2;
  }

  function buildTrack(track: Track) {
    const { lo, hi } = domain(track);
    const h = track.heightPx;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < t.length; i++) {
      const v = track.values[i];
      if (v === undefined || !Number.isFinite(v)) continue;
      points.push({ x: px(t[i]!), y: yPixel(v, h, lo, hi, !!track.invertY) });
    }
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = points.length > 1 ? `${linePath} L${points[points.length - 1]!.x.toFixed(1)},${h} L${points[0]!.x.toFixed(1)},${h} Z` : '';
    const finite = track.values.filter((v) => Number.isFinite(v));
    const mean = finite.length > 0 ? finite.reduce((s, v) => s + v, 0) / finite.length : lo;
    const bands = (track.bands ?? []).map((b) => ({
      y: Math.min(yPixel(b.y0, h, lo, hi, !!track.invertY), yPixel(b.y1, h, lo, hi, !!track.invertY)),
      height: Math.abs(yPixel(b.y1, h, lo, hi, !!track.invertY) - yPixel(b.y0, h, lo, hi, !!track.invertY)),
      color: b.color,
      opacity: b.opacity ?? 0.14
    }));
    const idx = hoveredIndex;
    let hover: { y: number; label: string } | null = null;
    if (idx !== null) {
      const v = track.values[idx];
      if (v !== undefined && Number.isFinite(v)) {
        hover = { y: yPixel(v, h, lo, hi, !!track.invertY), label: track.formatY(v) };
      }
    }
    return {
      points,
      linePath,
      areaPath,
      meanY: yPixel(mean, h, lo, hi, !!track.invertY),
      grid: [h * 0.33, h * 0.66],
      bands,
      maxLabel: track.formatY(hi),
      minLabel: track.formatY(lo),
      hover
    };
  }

  // Nearest sample index to the shared cursor, used to look up each track's
  // own value at that instant for its hover tooltip - separate from
  // `nearestSample` below, which resolves to a time value rather than an
  // index for the crosshair's own x position.
  let hoveredIndex = $derived.by(() => {
    if (syncSeconds === null || syncSeconds === undefined || t.length === 0) return null;
    let best = 0;
    let bestDist = Infinity;
    t.forEach((sample, i) => {
      const d = Math.abs(sample - syncSeconds!);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  });

  let built = $derived(tracks.map((track) => ({ track, ...buildTrack(track) })));

  const AXIS_TICKS = 7;
  let axisTicks = $derived(Array.from({ length: AXIS_TICKS }, (_, i) => tMin + (tSpan * i) / (AXIS_TICKS - 1)));

  let cursorPct = $derived(syncSeconds !== null && syncSeconds !== undefined ? (px(syncSeconds) / VB_W) * 100 : null);

  let stackEl = $state<HTMLDivElement | null>(null);

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

  // Same pointer handling as EffortTape: mouse hovers, a finger drags
  // sideways to scrub and the position stays when it lifts.
  function handleDown(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    handleMove(e);
  }

  function handleMove(e: PointerEvent) {
    if (!stackEl || t.length === 0) return;
    if (e.pointerType !== 'mouse' && e.buttons === 0 && e.type === 'pointermove') return;
    const rect = stackEl.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    syncSeconds = nearestSample(tMin + frac * tSpan);
  }

  function handleLeave(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    syncSeconds = null;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="streams-stack" bind:this={stackEl} onpointerdown={handleDown} onpointermove={handleMove} onpointerleave={handleLeave}>
  {#each built as b (b.track.key)}
    <div class="stream-track">
      <div class="stream-track-head">
        <span class="stream-track-label" style="color: {b.track.color};">{b.track.label}</span>
        <span class="stream-track-unit">{b.track.unit}</span>
        <span class="stream-track-summary">{b.track.summary}</span>
      </div>
      <div class="stream-track-box" style="height: {b.track.heightPx}px;">
        <svg viewBox="0 0 {VB_W} {b.track.heightPx}" preserveAspectRatio="none" class="stream-track-svg" role="img" aria-label="{b.track.label} ({b.track.unit}) over the activity: {b.track.summary}. Use the timeline slider above to step through it.">
          {#each b.bands as band, i (i)}
            <rect x="0" y={band.y} width={VB_W} height={band.height} fill={band.color} opacity={band.opacity} />
          {/each}
          {#each b.grid as gy (gy)}
            <line x1="0" y1={gy} x2={VB_W} y2={gy} class="stream-gridline" />
          {/each}
          {#if b.track.mode === 'scatter'}
            {#each b.points as p, i (i)}
              <circle cx={p.x} cy={p.y} r="1.8" fill={b.track.color} />
            {/each}
          {:else}
            <path d={b.areaPath} fill={b.track.color} opacity={0.18} />
            <path d={b.linePath} fill="none" stroke={b.track.color} stroke-width="1.6" vector-effect="non-scaling-stroke" />
          {/if}
          <line x1="0" y1={b.meanY} x2={VB_W} y2={b.meanY} class="stream-mean-line" />
          {#if b.hover}
            <circle cx={cursorPct !== null ? (cursorPct / 100) * VB_W : 0} cy={b.hover.y} r="3" fill={b.track.color} stroke="var(--bg-well)" stroke-width="1.5" />
          {/if}
        </svg>
        <span class="stream-corner-label top">{b.maxLabel}</span>
        <span class="stream-corner-label bottom">{b.minLabel}</span>
        {#if b.hover && cursorPct !== null}
          <div class="chart-tooltip" style="left: {cursorPct}%; top: {(b.hover.y / b.track.heightPx) * 100}%;">
            <div class="chart-tooltip-row">
              <span class="chart-tooltip-value">{b.hover.label} {b.track.unit}</span>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/each}

  {#if cursorPct !== null}
    <div class="stream-cursor-line" style="left: {cursorPct}%;"></div>
    <div class="stream-cursor-dot" style="left: {cursorPct}%;"></div>
  {/if}
</div>

<div class="stream-time-axis mono">
  {#each axisTicks as tick, i (i)}
    <span class:first={i === 0} class:last={i === axisTicks.length - 1}>{formatTime(tick)}</span>
  {/each}
</div>

<style>
  .streams-stack {
    position: relative;
    cursor: crosshair;
    touch-action: pan-y;
    -webkit-user-select: none;
    user-select: none;
  }
  .stream-track {
    margin-bottom: var(--space-4);
  }
  .stream-track-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    margin-bottom: var(--space-2);
  }
  .stream-track-label {
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
  }
  .stream-track-unit {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--ink-5);
  }
  .stream-track-summary {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--ink-5);
  }
  .stream-track-box {
    position: relative;
    background: var(--bg-well);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-sm);
  }
  .stream-track-svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .stream-gridline {
    stroke: var(--line-soft);
    stroke-width: 1;
  }
  .stream-mean-line {
    stroke: var(--ink-4);
    stroke-width: 1;
    stroke-dasharray: 3 3;
    vector-effect: non-scaling-stroke;
  }
  .stream-corner-label {
    position: absolute;
    left: 6px;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--ink-5);
    pointer-events: none;
  }
  .stream-corner-label.top {
    top: 3px;
  }
  .stream-corner-label.bottom {
    bottom: 3px;
  }
  .stream-cursor-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--accent);
    pointer-events: none;
  }
  .stream-cursor-dot {
    position: absolute;
    top: -4px;
    width: 7px;
    height: 7px;
    margin-left: -3px;
    border-radius: 4px;
    background: var(--accent);
    pointer-events: none;
  }
  .stream-time-axis {
    display: flex;
    justify-content: space-between;
    margin-top: var(--space-1);
    font-size: var(--fs-xs);
    color: var(--ink-5);
  }
  /* All 7 ticks only have room to not overlap once this panel is wide
     enough - below ~720px the panel is always a single (often phone-width)
     column, per .panel-row-2's own collapse threshold, so keep just the
     first, middle and last tick rather than letting all 7 run together
     illegibly. AXIS_TICKS is fixed at 7 (see script), so the 4th child is
     always the middle one. */
  @media (max-width: 720px) {
    .stream-time-axis span:not(.first):not(.last):not(:nth-child(4)) {
      display: none;
    }
  }
</style>
