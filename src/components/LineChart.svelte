<!-- LineChart.svelte - hand-rolled SVG line chart (no chart library).
     Used for both calendar-date trends and within-activity time-series -
     the caller supplies already-numeric x plus formatters for labels. -->
<script lang="ts">
  interface Point {
    x: number;
    y: number;
  }

  interface Props {
    points: Point[];
    color?: string;
    formatX: (x: number) => string;
    formatY: (y: number) => string;
    yMin?: number;
    // Force the x-axis span instead of auto-fitting to this chart's own
    // points - for a sparse series (e.g. a metric only sampled every so
    // often) that needs to line up on the same horizontal scale as sibling
    // charts plotting the full timeline, not just the range this series
    // happens to have data for.
    xDomainMin?: number;
    xDomainMax?: number;
    referenceValue?: number;
    referenceLabel?: string;
    emptyText?: string;
    // Render as bars instead of a line/area. Auto-falls back to a line once
    // the series has more points than BAR_MAX_POINTS below - a dense
    // per-second series (hundreds/thousands of points) would just render as
    // unreadable sub-pixel-thin bars, so this guard keeps that combination
    // legible without the caller needing to know the point count up front.
    barMode?: boolean;
    // Bindable shared hover position for a group of charts on the same x
    // domain (bind the same variable into every chart in the group from
    // their common parent). Left unbound, a chart just tracks its own
    // hover locally with no cross-chart effect - fully backward compatible.
    syncX?: number | null;
    // Flips the y-pixel mapping (higher data value -> lower on screen)
    // without touching tick labels/tooltip text - for "faster = up" pace
    // tracks, where the underlying values (minutes/km) are unchanged.
    invertY?: boolean;
    // Colored background bands (e.g. HR zone ranges), drawn behind
    // everything else, in data-y units.
    bands?: { y0: number; y1: number; color: string; opacity?: number }[];
    // A real, caller-supplied description for the SVG's accessible name -
    // this chart has no default guess at what it's plotting, so callers
    // should always pass one describing their real data/axes.
    ariaLabel?: string;
  }

  let {
    points,
    color = 'var(--accent)',
    formatX,
    formatY,
    yMin,
    xDomainMin,
    xDomainMax,
    referenceValue,
    referenceLabel,
    emptyText = 'Not enough data yet.',
    barMode = false,
    syncX = $bindable(null),
    invertY = false,
    bands = [],
    ariaLabel = 'Chart'
  }: Props = $props();

  // A dense per-second series rendered as bars is just noise (hundreds of
  // sub-pixel-thin rects) - past this many points, fall back to a line
  // regardless of what the caller asked for.
  const BAR_MAX_POINTS = 60;

  // The SVG is responsive via viewBox (width:100% in CSS), so rendered text
  // size depends on the container width vs VB_W below - these are sized for
  // ~13px at a ~600px render width (a grid-2 chart on the widened layout).
  // Y-axis ticks are bare numbers (see tickLabel below - the unit lives in
  // the tooltip instead), so M_LEFT only needs to fit a handful of
  // digits, not a whole formatted "5:33 /km"-style string. X-axis ticks are
  // horizontal and capped at X_TICKS evenly-spaced labels (see xTickItems)
  // rather than one per point, which is what keeps them from colliding.
  const VB_W = 640;
  const VB_H = 210;
  const M_LEFT = 48;
  const M_RIGHT = 16;
  const M_TOP = 16;
  const M_BOTTOM = 28;
  const PLOT_W = VB_W - M_LEFT - M_RIGHT;
  const PLOT_H = VB_H - M_TOP - M_BOTTOM;

  // Defensive: a series must be sorted, unique-x for the geometry below to
  // make sense (two points sharing an x reads as a vertical spike). Collapse
  // same-x points to their average rather than trust the caller.
  let series = $derived.by(() => {
    const byX = new Map<number, { sum: number; count: number }>();
    for (const p of points) {
      const e = byX.get(p.x) ?? { sum: 0, count: 0 };
      e.sum += p.y;
      e.count++;
      byX.set(p.x, e);
    }
    const xs = Array.from(byX.keys()).sort((a, b) => a - b);
    return xs.map((x) => ({ x, y: byX.get(x)!.sum / byX.get(x)!.count }));
  });

  let xMin = $derived(xDomainMin ?? (series.length > 0 ? series[0]!.x : 0));
  let xMax = $derived(xDomainMax ?? (series.length > 0 ? series[series.length - 1]!.x : 1));
  let xSpan = $derived(xMax - xMin || 1);

  let dataYMin = $derived(series.length > 0 ? Math.min(...series.map((p) => p.y), referenceValue ?? Infinity) : 0);
  let dataYMax = $derived(series.length > 0 ? Math.max(...series.map((p) => p.y), referenceValue ?? -Infinity) : 1);
  let yLo = $derived(yMin ?? (dataYMin > 0 && dataYMin / (dataYMax || 1) > 0.4 ? dataYMin - (dataYMax - dataYMin || dataYMax * 0.1 || 1) * 0.15 : Math.min(0, dataYMin)));
  let yHi = $derived(dataYMax + (dataYMax - yLo || dataYMax * 0.1 || 1) * 0.12);
  let ySpan = $derived(yHi - yLo || 1);

  function px(x: number): number {
    return M_LEFT + ((x - xMin) / xSpan) * PLOT_W;
  }
  function py(y: number): number {
    const frac = (y - yLo) / ySpan;
    return invertY ? M_TOP + frac * PLOT_H : M_TOP + PLOT_H - frac * PLOT_H;
  }

  let linePath = $derived(series.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' '));
  let areaPath = $derived(
    series.length > 1
      ? `${linePath} L${px(series[series.length - 1]!.x).toFixed(1)},${M_TOP + PLOT_H} L${px(series[0]!.x).toFixed(1)},${M_TOP + PLOT_H} Z`
      : ''
  );

  let useBars = $derived(barMode && series.length > 0 && series.length <= BAR_MAX_POINTS);
  // Bars are laid out categorically - one equal-width slot per point, in
  // series order - rather than at each point's true proportional x position.
  // Positioning by real x value (like the line/dot rendering does) was the
  // actual overlap bug: bar *width* was only ever an average-spacing
  // estimate, but real activity dates cluster unevenly within a time window,
  // so bars in a dense cluster sat closer together than that average and
  // collided no matter how the width was tuned. A fixed per-index slot makes
  // overlap impossible regardless of how the underlying dates are spaced.
  let barSlotW = $derived(series.length > 0 ? PLOT_W / series.length : 0);
  // Slim, with most of each slot left as air between bars.
  let barWidth = $derived(Math.min(16, barSlotW * 0.5));
  function barSlotX(i: number): number {
    return M_LEFT + (i + 0.5) * barSlotW;
  }
  const BASELINE_Y = M_TOP + PLOT_H; // = py(yLo) by construction; same baseline the area fill already drops to.
  let bars = $derived(
    series.map((p, i) => {
      const y = py(p.y);
      return { x: barSlotX(i), top: Math.min(y, BASELINE_Y), height: Math.abs(y - BASELINE_Y), point: p };
    })
  );

  const Y_TICKS = 4;
  let yTicks = $derived(Array.from({ length: Y_TICKS + 1 }, (_, i) => yLo + (ySpan * i) / Y_TICKS));

  // Axis ticks show a bare number - the unit is stated once (chart title /
  // tooltip via formatY) rather than repeated at every tick, which is both
  // more standard chart practice and what was overflowing the left margin
  // for unit-suffixed formatters like "5:33 /km".
  function tickLabel(v: number): string {
    const r = Math.round(v * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  const X_TICKS = 5;
  // {px, label} pairs - resolved once here rather than in the template so bar
  // mode (categorical slot positions) and line mode (true proportional
  // position) can each pick their own x-pixel without the markup needing to
  // know which is active.
  // Edge ticks land exactly at the plot's left/right boundary (bar mode's
  // slot centers are the exception, already inset by half a slot) - center
  // anchoring there would run half the label off the chart, so the first and
  // last labels anchor inward instead and only interior ticks center.
  function edgeAwareAnchor(i: number, n: number): 'start' | 'middle' | 'end' {
    if (n > 1 && i === 0) return 'start';
    if (n > 1 && i === n - 1) return 'end';
    return 'middle';
  }

  let xTickItems = $derived.by(() => {
    if (useBars) {
      // Categorical: ticks sit at the same per-index slot centers as the
      // bars themselves, so a label always lines up under its own bar.
      // Capped at X_TICKS evenly-spaced indices so a dense series (up to
      // BAR_MAX_POINTS bars) doesn't try to print one label per bar.
      const n = Math.min(X_TICKS, series.length);
      const idxs = n <= 1 ? [0] : Array.from({ length: n }, (_, k) => Math.round((k * (series.length - 1)) / (n - 1)));
      const seen = new Set<number>();
      const kept = idxs.filter((i) => !seen.has(i) && seen.add(i));
      return kept.map((i, k) => ({ px: barSlotX(i), label: formatX(series[i]!.x), anchor: edgeAwareAnchor(k, kept.length) }));
    }
    // A forced domain (see xDomainMin/xDomainMax) means sibling charts are
    // laid out on the same scale - keep evenly-spaced ticks across that full
    // domain so the tick positions line up between charts too, rather than
    // falling back to "one tick per point", which only reflects where this
    // particular (possibly sparse) series happens to have data.
    const forced = xDomainMin !== undefined || xDomainMax !== undefined;
    const values = !forced && series.length <= X_TICKS ? series.map((p) => p.x) : Array.from({ length: X_TICKS }, (_, i) => xMin + (xSpan * i) / (X_TICKS - 1));
    return values.map((v, i) => ({ px: px(v), label: formatX(v), anchor: edgeAwareAnchor(i, values.length) }));
  });

  // This chart's own hover point, from its own mouse events only (not from
  // syncX - see activePoint below for the combined value).
  let tooltip = $state<Point | null>(null);
  let wrapEl = $state<HTMLDivElement | null>(null);

  function nearestIndex(xVal: number): number {
    let best = 0;
    let bestDist = Infinity;
    series.forEach((p, i) => {
      const d = Math.abs(p.x - xVal);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  function nearestPoint(xVal: number): Point {
    return series[nearestIndex(xVal)]!;
  }

  // Screen-x for a point, matching however this chart is actually rendering
  // it right now - the categorical slot center in bar mode, the true
  // proportional position otherwise. Used for the crosshair/hover dot so it
  // never drifts off of the bar/line it's meant to be marking.
  function pointScreenX(p: Point): number {
    return useBars ? barSlotX(nearestIndex(p.x)) : px(p.x);
  }

  // The crosshair/dot/tooltip all follow whichever is active: this chart's
  // own mouse position if the mouse is over it, otherwise the group's shared
  // syncX (driven by whichever sibling chart the mouse is actually over)
  // mapped onto this chart's own series - so every chart in the group shows
  // its own value at the same x, tooltip included, even the ones the mouse
  // isn't touching.
  let activePoint = $derived.by(() => {
    if (tooltip) return tooltip;
    if (syncX !== null && syncX !== undefined && series.length > 0) return nearestPoint(syncX);
    return null;
  });

  // Tooltip box position as a percentage of the chart's own viewBox, not raw
  // mouse pixels - a synced-but-not-hovered chart has no mouse event of its
  // own to read a position from, only activePoint's data coordinates. Percent
  // works because the wrapper and the SVG always share the same aspect ratio
  // (width: 100%, height: auto derived from the viewBox).
  let tooltipPos = $derived(activePoint ? { left: (pointScreenX(activePoint) / VB_W) * 100, top: (py(activePoint.y) / VB_H) * 100 } : null);

  function handleMove(e: MouseEvent) {
    if (!wrapEl || series.length === 0) return;
    const rect = wrapEl.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * VB_W;
    if (useBars) {
      const i = Math.min(series.length - 1, Math.max(0, Math.floor((svgX - M_LEFT) / barSlotW)));
      tooltip = series[i]!;
    } else {
      const dataX = xMin + ((svgX - M_LEFT) / PLOT_W) * xSpan;
      tooltip = nearestPoint(dataX);
    }
    syncX = tooltip.x;
  }

  function handleLeave() {
    tooltip = null;
    syncX = null;
  }
</script>

{#if series.length < 2}
  <div class="empty-state" style="padding: var(--space-10) var(--space-4);">
    <p style="margin: 0;">{emptyText}</p>
  </div>
{:else}
  <div class="line-chart-wrap" bind:this={wrapEl}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <svg viewBox="0 0 {VB_W} {VB_H}" class="line-chart-svg" role="img" aria-label={ariaLabel} onmousemove={handleMove} onmouseleave={handleLeave}>
      {#each bands as b (b.y0 + '-' + b.y1 + b.color)}
        <rect
          x={M_LEFT}
          y={Math.min(py(b.y0), py(b.y1))}
          width={PLOT_W}
          height={Math.abs(py(b.y1) - py(b.y0))}
          fill={b.color}
          fill-opacity={b.opacity ?? 0.14}
        />
      {/each}
      {#each yTicks as t (t)}
        <line x1={M_LEFT} y1={py(t)} x2={VB_W - M_RIGHT} y2={py(t)} class="gridline" />
        <text x={M_LEFT - 8} y={py(t)} text-anchor="end" dominant-baseline="middle" class="tick-label">{tickLabel(t)}</text>
      {/each}
      {#each xTickItems as t (t.px)}
        <text x={t.px} y={VB_H - 8} text-anchor={t.anchor} class="tick-label">{t.label}</text>
      {/each}

      {#if referenceValue !== undefined && referenceValue > 0}
        <line x1={M_LEFT} y1={py(referenceValue)} x2={VB_W - M_RIGHT} y2={py(referenceValue)} class="reference-line" style="stroke: {color};" />
        <text x={VB_W - M_RIGHT} y={py(referenceValue) - 5} text-anchor="end" class="reference-label" style="fill: {color};">
          {referenceLabel ?? 'Reference'}: {formatY(referenceValue)}
        </text>
      {/if}

      {#if useBars}
        {#each bars as b (b.point.x)}
          <rect x={b.x - barWidth / 2} y={b.top} width={barWidth} height={b.height} rx="2" fill={color} fill-opacity="0.35" stroke={color} stroke-width="1.25" />
        {/each}
      {:else}
        <path d={areaPath} fill={color} opacity="0.1" />
        <path d={linePath} fill="none" stroke={color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />

        {#if series.length <= 40}
          {#each series as p (p.x)}
            <circle cx={px(p.x)} cy={py(p.y)} r="3" fill={color} stroke="var(--surface)" stroke-width="1.5" />
          {/each}
        {/if}
      {/if}

      {#if activePoint}
        <line x1={pointScreenX(activePoint)} y1={M_TOP} x2={pointScreenX(activePoint)} y2={M_TOP + PLOT_H} class="crosshair" />
        <circle cx={pointScreenX(activePoint)} cy={py(activePoint.y)} r="4.5" fill={color} stroke="var(--surface)" stroke-width="2" />
      {/if}
    </svg>

    {#if activePoint && tooltipPos}
      <div class="chart-tooltip" style="left: {tooltipPos.left}%; top: {tooltipPos.top}%;">
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label">{formatX(activePoint.x)}</span>
          <span class="chart-tooltip-value">{formatY(activePoint.y)}</span>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .line-chart-wrap {
    position: relative;
  }
  .line-chart-svg {
    width: 100%;
    height: auto;
    display: block;
    overflow: hidden;
  }
  .gridline {
    stroke: var(--hairline);
    stroke-width: 1;
  }
  .tick-label {
    fill: var(--ink-muted);
    font-size: var(--fs-md);
    font-family: var(--font);
  }
  .reference-line {
    stroke-width: 1.5;
    stroke-dasharray: 4 4;
    opacity: 0.6;
  }
  .reference-label {
    font-size: var(--fs-base);
    font-weight: var(--fw-bold);
    font-family: var(--font);
  }
  .crosshair {
    stroke: var(--border-strong);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  .chart-tooltip {
    position: absolute;
    transform: translate(-50%, -100%);
    margin-top: -12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-3) var(--space-5);
    font-size: var(--fs-md);
    pointer-events: none;
    white-space: nowrap;
    z-index: 5;
  }
  .chart-tooltip-row {
    display: flex;
    align-items: center;
    gap: var(--space-5);
  }
  .chart-tooltip-label {
    color: var(--ink-secondary);
  }
  .chart-tooltip-value {
    font-weight: var(--fw-bold);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
</style>
