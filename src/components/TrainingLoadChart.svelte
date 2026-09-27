<!-- TrainingLoadChart.svelte - Today's "acute vs chronic" load chart: 12
     weekly bars + a productive band + a 6-week trailing chronic mean line.
     Hand-rolled SVG (no chart lib), following LineChart.svelte's convention
     of drawing axis ticks inside the viewBox rather than in external HTML. -->
<script lang="ts">
  import type { Activity } from '../lib/types';
  import { weeklyLoadBuckets, trailingMean } from '../lib/training-load';
  import { chartLabelFontSize, chartViewBoxHeight } from '../lib/chart-scale';
  import { addDays, bucketIndexForDate, bucketStartDate, formatDateRangeShort, formatDateShort } from '../lib/date-utils';

  interface Props {
    activities: Activity[];
    weeksShown?: number;
  }

  let { activities, weeksShown = 12 }: Props = $props();

  let containerWidth = $state(0);

  const CHRONIC_WINDOW = 6;
  const VB_W = 1000;
  const M_RIGHT = 8;

  let labelFontSize = $derived(chartLabelFontSize(VB_W, containerWidth));
  let VB_H = $derived(chartViewBoxHeight(VB_W, 176, containerWidth));

  let allWeekly = $derived(weeklyLoadBuckets(activities, weeksShown + CHRONIC_WINDOW));
  let allLoads = $derived(allWeekly.map((w) => w.load));
  let chronicAll = $derived(trailingMean(allLoads, CHRONIC_WINDOW));

  let weekly = $derived(allWeekly.slice(CHRONIC_WINDOW));
  let chronic = $derived(chronicAll.slice(CHRONIC_WINDOW));

  let domainMax = $derived.by(() => {
    const peak = Math.max(1, ...weekly.map((w) => w.load), ...chronic);
    const step = 150;
    return Math.ceil((peak * 1.15) / step) * step;
  });

  // Margins grow with the axis label size (in viewBox units - bigger on a
  // narrow panel or a larger Text size setting), so the y-axis numbers and
  // x-axis dates never clip at the edges or overlap the plot.
  let M_LEFT = $derived(Math.max(48, String(Math.round(domainMax)).length * labelFontSize * 0.6 + 10));
  let M_TOP = $derived(Math.max(8, labelFontSize * 0.6));
  let M_BOTTOM = $derived(Math.max(20, labelFontSize + 6));
  let PLOT_W = $derived(VB_W - M_LEFT - M_RIGHT);
  let PLOT_H = $derived(VB_H - M_TOP - M_BOTTOM);

  function py(v: number): number {
    return M_TOP + PLOT_H - (v / domainMax) * PLOT_H;
  }

  // 4 intervals when there's room, halving until the labels (~1.5 lines
  // apart) fit - on a phone this fixed-aspect chart is only ~60px tall.
  let yIntervals = $derived([4, 2, 1].find((n) => PLOT_H / n >= labelFontSize * 1.5) ?? 1);
  let yTicks = $derived(Array.from({ length: yIntervals + 1 }, (_, i) => (domainMax * (yIntervals - i)) / yIntervals));

  let slotW = $derived(PLOT_W / Math.max(1, weekly.length));
  let barW = $derived(slotW * 0.56);
  function barX(i: number): number {
    return M_LEFT + i * slotW + slotW * 0.22;
  }

  let bars = $derived(
    weekly.map((w, i) => {
      const top = py(w.load);
      return { x: barX(i), top, height: Math.max(0, py(0) - top), isCurrent: w.isCurrent };
    })
  );

  let chronicPath = $derived(
    chronic.map((v, i) => `${i === 0 ? 'M' : 'L'}${(M_LEFT + (i + 0.5) * slotW).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
  );
  let chronicAreaPath = $derived(
    chronic.length > 1
      ? `${chronicPath} L${(M_LEFT + (chronic.length - 0.5) * slotW).toFixed(1)},${py(0)} L${(M_LEFT + 0.5 * slotW).toFixed(1)},${py(0)} Z`
      : ''
  );

  const PRODUCTIVE_LOW = 0.5;
  const PRODUCTIVE_HIGH = 0.86;

  let totalWeeks = $derived(weeksShown + CHRONIC_WINDOW);

  // X-axis labels are each week's real start date ("5 Sep"), thinned to
  // fit: the stride is how many week slots one label (plus a gap) needs at
  // the current rendered font size, so 52 weeks on a narrow panel doesn't
  // collide. Counted back from the latest week so "this week" is always
  // labelled.
  function weekLabel(i: number): string {
    return formatDateShort(bucketStartDate(i + CHRONIC_WINDOW, totalWeeks, 7));
  }
  const LABEL_CHARS = 6; // "30 Sep"
  let labelW = $derived(LABEL_CHARS * labelFontSize * 0.6); // mono font: ~0.6em per char
  let labelGap = $derived(labelFontSize * 1.2);
  let xTickStride = $derived(Math.max(1, Math.ceil((labelW + labelGap) / slotW)));
  // Each label is centred under its week, but clamped inside the viewBox -
  // on a narrow panel a date is wider than the half-slot between the last
  // bar's centre and the edge. That clamp can push an edge label into its
  // neighbour; then the edge label is dropped, keeping the rest evenly spaced.
  let xTicks = $derived.by(() => {
    const half = labelW / 2;
    const ticks: { i: number; x: number }[] = [];
    for (let i = weekly.length - 1; i >= 0; i -= xTickStride) {
      ticks.push({ i, x: Math.min(VB_W - half, Math.max(half, M_LEFT + (i + 0.5) * slotW)) });
    }
    const minDist = labelW + labelGap / 2;
    if (ticks.length > 1 && ticks[0]!.x - ticks[1]!.x < minDist) ticks.shift();
    if (ticks.length > 1 && ticks[ticks.length - 2]!.x - ticks[ticks.length - 1]!.x < minDist) ticks.pop();
    return ticks;
  });

  // Hover tooltip: the whole week column is the hit area (not just the
  // bar, which can be tiny or empty), showing that week's real dates,
  // load, the chronic average at that point, and its session count.
  let sessionsPerWeek = $derived.by(() => {
    const counts = new Array<number>(weekly.length).fill(0);
    for (const a of activities) {
      const idx = bucketIndexForDate(a.date, totalWeeks, 7);
      if (idx !== null && idx >= CHRONIC_WINDOW) counts[idx - CHRONIC_WINDOW]! += 1;
    }
    return counts;
  });

  let svgEl = $state<SVGSVGElement | null>(null);
  let hoverIdx = $state<number | null>(null);

  function handleMove(e: MouseEvent) {
    if (!svgEl || weekly.length === 0) return;
    const rect = svgEl.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * VB_W;
    const i = Math.floor((vbX - M_LEFT) / slotW);
    hoverIdx = i >= 0 && i < weekly.length ? i : null;
  }

  let tooltip = $derived.by(() => {
    if (hoverIdx === null) return null;
    const w = weekly[hoverIdx];
    if (!w) return null;
    const start = bucketStartDate(hoverIdx + CHRONIC_WINDOW, totalWeeks, 7);
    const centerX = M_LEFT + (hoverIdx + 0.5) * slotW;
    const leftPct = (centerX / VB_W) * 100;
    return {
      range: formatDateRangeShort(start, addDays(start, 6)),
      isCurrent: w.isCurrent,
      load: Math.round(w.load),
      chronic: Math.round(chronic[hoverIdx] ?? 0),
      sessions: sessionsPerWeek[hoverIdx] ?? 0,
      // Beside the hovered week, at the top of the plot - not above the
      // bar, where it would cover the panel's own Ratio/Status header on
      // this short chart - flipping to the left past the midpoint.
      leftPct,
      topPct: (M_TOP / VB_H) * 100,
      flip: leftPct > 55
    };
  });
</script>

<div class="load-chart-wrap" bind:clientWidth={containerWidth}>
  <svg
    viewBox="0 0 {VB_W} {VB_H}"
    class="load-chart-svg"
    style="--chart-label-fs: {labelFontSize}px"
    role="img"
    aria-label="Weekly training load"
    bind:this={svgEl}
    onmousemove={handleMove}
    onmouseleave={() => (hoverIdx = null)}
  >
    <rect x={M_LEFT} y={M_TOP} width={PLOT_W} height={PLOT_H} fill="var(--bg-well)" />
    <rect
      x={M_LEFT}
      y={py(domainMax * PRODUCTIVE_HIGH)}
      width={PLOT_W}
      height={py(domainMax * PRODUCTIVE_LOW) - py(domainMax * PRODUCTIVE_HIGH)}
      fill="var(--positive)"
      fill-opacity="0.07"
    />

    {#each yTicks as t (t)}
      <line x1={M_LEFT} y1={py(t)} x2={VB_W - M_RIGHT} y2={py(t)} stroke="var(--line-soft)" stroke-width="1" vector-effect="non-scaling-stroke" />
      <text x={M_LEFT - 6} y={py(t)} text-anchor="end" dominant-baseline="middle" class="chart-axis-label">{Math.round(t)}</text>
    {/each}

    {#if hoverIdx !== null}
      <rect x={M_LEFT + hoverIdx * slotW} y={M_TOP} width={slotW} height={PLOT_H} fill="var(--ink-1)" opacity="0.05" />
    {/if}

    {#each bars as b, i (b.x)}
      <rect x={b.x} y={b.top} width={barW} height={b.height} fill={b.isCurrent || i === hoverIdx ? 'var(--neutral-bar-last)' : 'var(--neutral-bar)'} />
    {/each}

    {#if chronic.length > 1}
      <path d={chronicAreaPath} fill="var(--accent)" opacity="0.1" />
      <path d={chronicPath} fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke" />
    {/if}

    {#each xTicks as { i, x } (i)}
      <text x={x} y={VB_H - 4} text-anchor="middle" class="chart-axis-label">{weekLabel(i)}</text>
    {/each}
  </svg>
  <!-- HTML rather than SVG text, so it renders at the type scale's real px
       size instead of shrinking with the viewBox on a narrow panel. -->
  <div class="load-legend" style="top: {(M_TOP / VB_H) * 100}%; right: {(M_RIGHT / VB_W) * 100}%;">
    <span class="load-legend-item"><span class="load-legend-swatch bar"></span>weekly load</span>
    <span class="load-legend-item"><span class="load-legend-swatch line"></span>42d chronic</span>
  </div>
  {#if tooltip}
    <div class="chart-tooltip load-tooltip" class:flip={tooltip.flip} style="left: {tooltip.leftPct}%; top: {tooltip.topPct}%;">
      <div class="chart-tooltip-row">
        <span class="chart-tooltip-label">{tooltip.range}{tooltip.isCurrent ? ' · this week' : ''}</span>
      </div>
      <div class="chart-tooltip-row">
        <span class="chart-tooltip-label">Load</span>
        <span class="chart-tooltip-value">{tooltip.load} au</span>
      </div>
      <div class="chart-tooltip-row">
        <span class="chart-tooltip-label">42d chronic</span>
        <span class="chart-tooltip-value" style="color: var(--accent);">{tooltip.chronic} au</span>
      </div>
      <div class="chart-tooltip-row">
        <span class="chart-tooltip-label">Sessions</span>
        <span class="chart-tooltip-value">{tooltip.sessions}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .load-chart-wrap {
    position: relative;
  }
  .load-chart-svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .load-tooltip {
    margin-top: 0;
    transform: translateX(14px);
  }
  .load-tooltip.flip {
    transform: translateX(calc(-100% - 14px));
  }
  .load-legend {
    position: absolute;
    display: flex;
    gap: var(--space-5);
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--ink-5);
    pointer-events: none;
  }
  .load-legend-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .load-legend-swatch {
    display: inline-block;
    width: 8px;
  }
  .load-legend-swatch.bar {
    height: 8px;
    background: var(--neutral-line);
  }
  .load-legend-swatch.line {
    height: 2px;
    background: var(--accent);
  }
</style>
