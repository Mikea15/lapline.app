<!-- StreamChart.svelte - a compact real per-second time-series chart (Heart
     Rate / Cadence / Performance Condition / Elevation), a hand-rolled
     area+line chart plotted against time. Bindable syncSeconds shares the same scrub cursor
     EffortTape/RouteMap already drive, so hovering any of these tracks
     moves the others (and the route marker) too - the same idea the old
     Atlas "Synchronised Streams" panel had, rebuilt fresh in Tape's own
     visual language rather than reused as-is. -->
<script lang="ts">
  import { touchHover } from '../lib/touch-hover';
  interface Props {
    t: number[];
    values: (number | null)[]; // null = no real reading at that second, skipped
    formatTime: (sec: number) => string;
    formatValue: (v: number) => string;
    color?: string;
    zeroLine?: boolean; // draws a reference line at y=0 (e.g. Performance Condition's +/- scale)
    // Fixed y-range (e.g. a trimmed altitude range). The line is clamped to it
    // rather than stretching the axis to outliers like GPS altitude wander.
    domain?: { min: number; max: number } | null;
    syncSeconds?: number | null; // bindable shared scrub position, seconds
  }

  let { t, values, formatTime, formatValue, color = 'var(--accent)', zeroLine = false, domain = null, syncSeconds = $bindable(null) }: Props = $props();

  const VB_W = 400;
  const VB_H = 100;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 4;
  const PLOT_H = VB_H - PAD_TOP - PAD_BOTTOM;

  let samples = $derived.by(() => {
    const n = Math.min(t.length, values.length);
    const out: { sec: number; v: number }[] = [];
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (v !== null && v !== undefined) out.push({ sec: t[i]!, v });
    }
    return out;
  });

  let range = $derived.by(() => {
    if (domain) return domain;
    if (samples.length === 0) return { min: 0, max: 1 };
    const vals = samples.map((s) => s.v);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (zeroLine) {
      min = Math.min(min, 0);
      max = Math.max(max, 0);
    }
    return { min, max };
  });

  let tMin = $derived(t.length > 0 ? t[0]! : 0);
  let tMax = $derived(t.length > 0 ? t[t.length - 1]! : 1);
  let tSpan = $derived(tMax - tMin || 1);

  function px(sec: number): number {
    return ((sec - tMin) / tSpan) * VB_W;
  }
  function py(v: number): number {
    const span = range.max - range.min || 1;
    const frac = Math.max(0, Math.min(1, (v - range.min) / span));
    return PAD_TOP + PLOT_H - frac * PLOT_H;
  }

  let linePath = $derived(samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${px(s.sec).toFixed(1)},${py(s.v).toFixed(1)}`).join(' '));
  let areaPath = $derived(
    samples.length > 1
      ? `${linePath} L${px(samples[samples.length - 1]!.sec).toFixed(1)},${PAD_TOP + PLOT_H} L${px(samples[0]!.sec).toFixed(1)},${PAD_TOP + PLOT_H} Z`
      : ''
  );

  // Real time ticks across the whole activity span (first/last pinned to
  // the edges), so the x-axis reads as time and never as a value label.
  const TICK_COUNT = 5;
  let ticks = $derived(Array.from({ length: TICK_COUNT }, (_, i) => tMin + (tSpan * i) / (TICK_COUNT - 1)));

  let wrapEl = $state<HTMLDivElement | null>(null);

  function handleMove(e: MouseEvent) {
    if (!wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    syncSeconds = tMin + frac * tSpan;
  }
  function handleLeave() {
    syncSeconds = null;
  }

  function nearestSample(sec: number): { sec: number; v: number } | null {
    if (samples.length === 0) return null;
    let best = samples[0]!;
    let bestDist = Infinity;
    for (const s of samples) {
      const d = Math.abs(s.sec - sec);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  let hoverPoint = $derived(syncSeconds !== null ? nearestSample(syncSeconds) : null);
</script>

{#if samples.length < 2}
  <div class="empty-state">No data for this activity.</div>
{:else}
  <div class="stream-chart">
    <div class="stream-chart-ylabels mono" aria-hidden="true">
      <span>{formatValue(range.max)}</span>
      <span class="stream-chart-min">{formatValue(range.min)}</span>
    </div>
    <div class="stream-chart-plot" bind:this={wrapEl}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <svg use:touchHover viewBox="0 0 {VB_W} {VB_H}" preserveAspectRatio="none" class="stream-svg" role="img" aria-label="Real values over the course of the activity, ranging {formatValue(range.min)} to {formatValue(range.max)}" onmousemove={handleMove} onmouseleave={handleLeave}>
      {#if zeroLine}
        <line x1="0" y1={py(0)} x2={VB_W} y2={py(0)} stroke="var(--line-row)" stroke-width="1" vector-effect="non-scaling-stroke" />
      {/if}
      <path d={areaPath} fill={color} opacity="0.12" />
      <path d={linePath} fill="none" stroke={color} stroke-width="1.6" vector-effect="non-scaling-stroke" />
      {#if hoverPoint}
        <line x1={px(hoverPoint.sec)} y1={PAD_TOP} x2={px(hoverPoint.sec)} y2={PAD_TOP + PLOT_H} stroke="var(--accent)" stroke-width="1" vector-effect="non-scaling-stroke" />
      {/if}
    </svg>
    {#if hoverPoint}
      <!-- A plain HTML circle, not an SVG <circle> - this chart's viewBox
           scales its X and Y axes independently (preserveAspectRatio="none",
           needed so the area/line fills a wide-short panel with no
           letterboxing), which stretched an SVG circle into a warped
           ellipse (bug-list.md). VB_H's viewBox units already equal real
           pixels 1:1 (fixed height: 100px above), so `top` is a plain px
           value rather than a percentage - only `left` needs to stay a
           percentage since the chart's width is responsive. -->
      <div class="stream-chart-dot" style="left: {(px(hoverPoint.sec) / VB_W) * 100}%; top: {py(hoverPoint.v)}px;"></div>
    {/if}
    <div class="stream-chart-axis mono" aria-hidden="true">
      {#each ticks as tick, i (i)}
        <span class="tick" class:first={i === 0} class:last={i === TICK_COUNT - 1} style="left: {(i / (TICK_COUNT - 1)) * 100}%;">{formatTime(tick)}</span>
      {/each}
    </div>
    {#if hoverPoint}
      <div class="chart-tooltip" style="left: {(px(hoverPoint.sec) / VB_W) * 100}%; top: {py(hoverPoint.v)}px;">
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label">{formatTime(hoverPoint.sec)}</span>
          <span class="chart-tooltip-value">{formatValue(hoverPoint.v)}</span>
        </div>
      </div>
    {/if}
    </div>
  </div>
{/if}

<style>
  .stream-chart {
    position: relative;
    display: flex;
    gap: var(--space-2);
  }
  /* Value labels sit in their own gutter on the y-axis side, aligned to
     the top and bottom of the plot, so they can't be mistaken for time
     ticks and never overlap the line. */
  .stream-chart-ylabels {
    flex: 0 0 auto;
    min-width: 5ch;
    height: 100px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-end;
    font-size: var(--fs-xs);
    line-height: 1;
    color: var(--ink-5);
    white-space: nowrap;
  }
  .stream-chart-plot {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
  }
  .stream-svg {
    width: 100%;
    height: 100px;
    display: block;
    cursor: crosshair;
  }
  .stream-chart-axis {
    position: relative;
    height: 1.4em;
    margin-top: var(--space-2);
    font-size: var(--fs-xs);
    color: var(--ink-5);
  }
  .tick {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .tick.first {
    transform: none;
  }
  .tick.last {
    transform: translateX(-100%);
  }
  @media (max-width: 720px) {
    .tick:nth-child(2),
    .tick:nth-child(4) {
      display: none;
    }
  }
  .stream-chart-dot {
    position: absolute;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    border: 1.5px solid var(--bg-app);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
</style>
