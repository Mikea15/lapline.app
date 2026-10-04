<!-- TrainingLoadChart.svelte - Today's "acute vs chronic" load chart:
     weekly load bars coloured by that week's ratio band (the same colours
     as the ratio strip and the panel's band strip; the current week is
     outlined),
     the 6-week trailing chronic mean as a line, and under them a strip of
     each week's acute:chronic ratio coloured by band, then the week dates.
     Hand-rolled SVG (no chart lib); the strip and dates are HTML laid out
     on the same week slots, so they stay at the type scale's real size. -->
<script lang="ts">
  import { touchHover } from '../lib/touch-hover';
  import type { Activity } from '../lib/types';
  import { weeklyLoadBuckets, trailingMean, loadBand, MIN_HISTORY_DAYS, LOAD_BAND_COLOR, LOAD_BAND_INK, LOAD_BAND_LABEL } from '../lib/training-load';
  import { chartLabelFontSize, chartViewBoxHeight, axisLabelSlots } from '../lib/chart-scale';
  import { settingsStore } from '../lib/stores.svelte';
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
  let VB_H = $derived(chartViewBoxHeight(VB_W, 200, containerWidth));

  let allWeekly = $derived(weeklyLoadBuckets(activities, weeksShown + CHRONIC_WINDOW));
  let allLoads = $derived(allWeekly.map((w) => w.load));
  let chronicAll = $derived(trailingMean(allLoads, CHRONIC_WINDOW));

  // Start the axis at the first week with data (not a run of empty weeks),
  // but never before the shown window.
  let firstData = $derived(allLoads.findIndex((l) => l > 0));
  let base = $derived(Math.max(CHRONIC_WINDOW, firstData));

  let weekly = $derived(allWeekly.slice(base));
  let chronic = $derived(chronicAll.slice(base));
  // Each week's own acute:chronic ratio. Null with no chronic baseline yet,
  // and for the first 4 weeks of history (same rule as Today's verdict),
  // when the ratio is noise.
  let ratios = $derived(
    weekly.map((w, i) => (chronic[i]! > 0 && (firstData <= 0 || base + i - firstData >= MIN_HISTORY_DAYS / 7) ? w.load / chronic[i]! : null))
  );

  let domainMax = $derived.by(() => {
    const peak = Math.max(1, ...weekly.map((w) => w.load), ...chronic);
    const step = 100;
    return Math.ceil((peak * 1.15) / step) * step;
  });

  // Margins grow with the axis label size (in viewBox units - bigger on a
  // narrow panel or a larger Text size setting), so the y-axis numbers and
  // x-axis dates never clip at the edges or overlap the plot.
  let M_LEFT = $derived(Math.max(48, String(Math.round(domainMax)).length * labelFontSize * 0.6 + 10));
  let M_TOP = $derived(Math.max(8, labelFontSize * 0.6));
  let M_BOTTOM = $derived(Math.max(4, labelFontSize * 0.4));
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
  let slotPx = $derived((containerWidth * slotW) / VB_W);
  let barW = $derived(slotW * 0.56);
  function barX(i: number): number {
    return M_LEFT + i * slotW + slotW * 0.22;
  }

  let bars = $derived(
    weekly.map((w, i) => {
      const top = py(w.load);
      const r = ratios[i] ?? null;
      return { x: barX(i), top, height: Math.max(0, py(0) - top), isCurrent: w.isCurrent, band: r === null ? null : loadBand(r) };
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

  let totalWeeks = $derived(weeksShown + CHRONIC_WINDOW);

  // X-axis labels are each week's real start date ("5 Sep"), thinned to
  // fit: the stride is how many week slots one label (plus a gap) needs at
  // the current rendered font size, so 52 weeks on a narrow panel doesn't
  // collide. Counted back from the latest week so "this week" is always
  // labelled.
  function weekLabel(i: number): string {
    return formatDateShort(bucketStartDate(i + base, totalWeeks, 7));
  }
  // Week labels are HTML at --fs-xs, so thin them in pixels: one label
  // ("30 Sep", mono ~0.6em a character) plus a gap per stride.
  const LABEL_CHARS = 6;
  let labelPx = $derived(LABEL_CHARS * 11 * settingsStore.getTextScale() * 0.6 + 12);
  // Labelled weeks, counted back from the latest so "this week" always is.
  let labelled = $derived(axisLabelSlots(weekly.length, slotPx, labelPx));
  // A month's first labelled week shows the month ("7 Aug"); the rest just
  // the day ("14"), as the design's axis does.
  function axisLabel(i: number): string {
    const label = weekLabel(i);
    const prev = [...labelled].filter((j) => j < i).sort((a, b) => b - a)[0];
    return prev !== undefined && weekLabel(prev).split(' ')[1] === label.split(' ')[1] ? label.split(' ')[0]! : label;
  }
  // The ratio strip shows numbers only when a week's slot is wide enough.
  let showRatioText = $derived(slotPx >= 38);

  // Hover tooltip: the whole week column is the hit area (not just the
  // bar, which can be tiny or empty), showing that week's real dates,
  // load, the chronic average at that point, and its session count.
  let sessionsPerWeek = $derived.by(() => {
    const counts = new Array<number>(weekly.length).fill(0);
    for (const a of activities) {
      const idx = bucketIndexForDate(a.date, totalWeeks, 7);
      if (idx !== null && idx >= base) counts[idx - base]! += 1;
    }
    return counts;
  });

  // Screen-reader summary of the latest week, plus a table of every week
  // below the chart (the hover tooltip has no keyboard equivalent).
  let a11yLabel = $derived.by(() => {
    const n = weekly.length;
    if (n === 0) return 'Weekly training load: no data yet';
    const r = ratios[n - 1] ?? null;
    return `Weekly training load, last ${n} weeks: this week ${Math.round(weekly[n - 1]!.load)}, 6-week average ${Math.round(chronic[n - 1] ?? 0)}${r === null ? ', ratio not available yet' : `, acute to chronic ratio ${r.toFixed(2)} (${LOAD_BAND_LABEL[loadBand(r)]})`}`;
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
    const start = bucketStartDate(hoverIdx + base, totalWeeks, 7);
    const centerX = M_LEFT + (hoverIdx + 0.5) * slotW;
    const leftPct = (centerX / VB_W) * 100;
    return {
      range: formatDateRangeShort(start, addDays(start, 6)),
      isCurrent: w.isCurrent,
      load: Math.round(w.load),
      chronic: Math.round(chronic[hoverIdx] ?? 0),
      sessions: sessionsPerWeek[hoverIdx] ?? 0,
      ratio: ratios[hoverIdx] ?? null,
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
    use:touchHover
    viewBox="0 0 {VB_W} {VB_H}"
    class="load-chart-svg"
    style="--chart-label-fs: {labelFontSize}px"
    role="img"
    aria-label={a11yLabel}
    bind:this={svgEl}
    onmousemove={handleMove}
    onmouseleave={() => (hoverIdx = null)}
  >

    {#each yTicks as t (t)}
      <line x1={M_LEFT} y1={py(t)} x2={VB_W - M_RIGHT} y2={py(t)} stroke="var(--line-soft)" stroke-width="1" vector-effect="non-scaling-stroke" />
      <text x={M_LEFT - 6} y={py(t)} text-anchor="end" dominant-baseline="middle" class="chart-axis-label">{Math.round(t)}</text>
    {/each}

    {#if hoverIdx !== null}
      <rect x={M_LEFT + hoverIdx * slotW} y={M_TOP} width={slotW} height={PLOT_H} fill="var(--ink-1)" opacity="0.05" />
    {/if}

    {#if chronic.length > 1}
      <path d={chronicAreaPath} fill="var(--accent)" opacity="0.06" />
    {/if}

    {#each bars as b, i (b.x)}
      <rect
        x={b.x}
        y={b.top}
        width={barW}
        height={b.height}
        rx="2"
        fill={b.band ? `color-mix(in srgb, ${LOAD_BAND_COLOR[b.band]} ${i === hoverIdx ? 75 : 55}%, var(--bg-panel))` : i === hoverIdx ? 'var(--neutral-bar-last)' : 'var(--neutral-bar)'}
        stroke={b.isCurrent ? 'var(--ink-1)' : 'none'}
        stroke-width="1.5"
        vector-effect="non-scaling-stroke"
      />
    {/each}

    {#if chronic.length > 1}
      <path d={chronicPath} fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke" />
      {#if slotPx >= 14}
        {#each chronic as v, i (i)}
          <circle cx={M_LEFT + (i + 0.5) * slotW} cy={py(v)} r={Math.max(3, labelFontSize * 0.3)} fill="var(--bg-panel)" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke" />
        {/each}
      {/if}
    {/if}
  </svg>
  {#if weekly.length > 0}
    <table class="sr-only">
      <caption>Weekly training load data</caption>
      <thead><tr><th scope="col">Week</th><th scope="col">Load</th><th scope="col">6-week average</th><th scope="col">Ratio</th><th scope="col">Sessions</th></tr></thead>
      <tbody>
        {#each weekly as w, i (i)}
          {@const start = bucketStartDate(i + base, totalWeeks, 7)}
          <tr>
            <th scope="row">{formatDateRangeShort(start, addDays(start, 6))}</th>
            <td>{Math.round(w.load)}</td>
            <td>{Math.round(chronic[i] ?? 0)}</td>
            <td>{ratios[i] === null ? 'n/a' : ratios[i]!.toFixed(2)}</td>
            <td>{sessionsPerWeek[i] ?? 0}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  <div class="week-rows" style="margin-left: {(M_LEFT / VB_W) * 100}%; margin-right: {(M_RIGHT / VB_W) * 100}%;">
    <div class="ratio-strip">
      {#each ratios as r, i (i)}
        {@const band = r === null ? null : loadBand(r)}
        <span
          class="ratio-chip mono"
          style={band ? `color: ${LOAD_BAND_INK[band]}; background: color-mix(in srgb, ${LOAD_BAND_COLOR[band]} ${showRatioText ? 16 : 45}%, var(--bg-panel));` : ''}
          title={r === null ? 'no baseline yet' : `ratio ${r.toFixed(2)}`}>{showRatioText ? (r === null ? '—' : r.toFixed(2)) : ''}</span
        >
      {/each}
    </div>
    <div class="week-labels">
      {#each weekly as _, i (i)}
        <span class="week-label mono">{#if labelled.has(i)}<span class="week-label-text">{axisLabel(i)}</span>{/if}</span>
      {/each}
    </div>
  </div>
  <!-- HTML rather than SVG text, so it renders at the type scale's real px
       size instead of shrinking with the viewBox on a narrow panel. -->
  <div class="load-legend" style="top: {(M_TOP / VB_H) * 100}%; right: {(M_RIGHT / VB_W) * 100}%;">
    <span class="load-legend-item" title="Bars are coloured by that week's ratio: detrain, productive, caution, risk">
      <span class="load-legend-bands">
        {#each Object.values(LOAD_BAND_COLOR) as c (c)}<span class="load-legend-swatch bar" style="background: color-mix(in srgb, {c} 55%, var(--bg-panel));"></span>{/each}
      </span>
      weekly load
    </span>
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
        <span class="chart-tooltip-value" style="color: var(--accent-ink);">{tooltip.chronic} au</span>
      </div>
      <div class="chart-tooltip-row">
        <span class="chart-tooltip-label">Ratio</span>
        {#if tooltip.ratio === null}
          <span class="chart-tooltip-value">no baseline yet</span>
        {:else}
          {@const band = loadBand(tooltip.ratio)}
          <span class="chart-tooltip-value" style="color: {LOAD_BAND_INK[band]};">{tooltip.ratio.toFixed(2)} · {LOAD_BAND_LABEL[band].toLowerCase()}</span>
        {/if}
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
  .week-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }
  .ratio-strip,
  .week-labels {
    display: flex;
  }
  .ratio-chip {
    flex: 1;
    min-width: 0;
    margin: 0 1px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    font-size: var(--fs-xs);
    background: var(--bg-well);
    color: var(--ink-5);
  }
  /* Each label is centred on its week, overflowing the narrow slot; the
     first and last are pinned to the chart's edges instead, so they can't
     be clipped (text overflowing its box ignores text-align). */
  .week-label {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 1.4em;
    font-size: var(--fs-xs);
    color: var(--ink-5);
  }
  .week-label-text {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .week-label:first-child .week-label-text {
    left: 0;
    transform: none;
  }
  .week-label:last-child .week-label-text {
    left: auto;
    right: 0;
    transform: none;
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
  .load-legend-bands {
    display: inline-flex;
    gap: 1px;
  }
  .load-legend-swatch.bar {
    height: 8px;
  }
  .load-legend-swatch.line {
    height: 2px;
    background: var(--accent);
  }
</style>
