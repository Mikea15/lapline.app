<!-- EfficiencyScatter.svelte - Trends "aerobic efficiency": pace at a given HR
     for every run in range, with a linear regression line. Pace is inverted
     on the y-axis (faster at top), so up-left is fitter. -->
<script lang="ts">
  import { touchHover } from '../lib/touch-hover';
  import type { Activity } from '../lib/types';
  import { chartLabelFontSize, chartViewBoxHeight } from '../lib/chart-scale';
  import { formatDateShort } from '../lib/date-utils';
  import { sportFamily } from '../lib/sport-color';
  import { formatPace, type UnitSystem } from '../lib/units';

  interface Props {
    activities: Activity[];
    unitSystem: UnitSystem;
  }

  let { activities, unitSystem }: Props = $props();

  let containerWidth = $state(0);

  // Plausible running pace window (min/km). Slower than ~12:00/km is a walk
  // or a paused recording, faster than 2:30/km is a GPS glitch - either would
  // stretch the axis and squash the real runs, so those are left off the plot
  // (and counted in a footnote) rather than drawn.
  const PACE_FAST = 2.5;
  const PACE_SLOW = 12;

  let candidates = $derived(
    activities
      .filter((a) => sportFamily(a.sport) === 'running' && a.avgHR > 0 && a.distanceKm > 0.5)
      .map((a) => ({ hr: a.avgHR, pace: a.durationMin / a.distanceKm, date: a.date, id: a.id }))
      .sort((a, b) => a.date.localeCompare(b.date))
  );
  let points = $derived(candidates.filter((p) => p.pace >= PACE_FAST && p.pace <= PACE_SLOW));
  let offScale = $derived(candidates.length - points.length);

  const VB_W = 400;

  let labelFontSize = $derived(chartLabelFontSize(VB_W, containerWidth));
  let VB_H = $derived(chartViewBoxHeight(VB_W, 212, containerWidth, 220));

  let hrMin = $derived(points.length > 0 ? Math.min(...points.map((p) => p.hr)) - 4 : 130);
  let hrMax = $derived(points.length > 0 ? Math.max(...points.map((p) => p.hr)) + 4 : 170);
  let paceMin = $derived(points.length > 0 ? Math.min(...points.map((p) => p.pace)) - 0.2 : 5);
  let paceMax = $derived(points.length > 0 ? Math.max(...points.map((p) => p.pace)) + 0.2 : 7);

  // Left margin fits the widest pace label ("7:36 /km") at the rendered
  // label size - a fixed 46 units clipped it to "/km" on a phone, where
  // each unit is wider in real pixels. Bottom margin fits one label line.
  let M = $derived(
    Math.max(46, Math.max(formatPace(paceMin, unitSystem).length, formatPace(paceMax, unitSystem).length) * labelFontSize * 0.6 + 10)
  );
  let M_BOTTOM = $derived(Math.max(46, labelFontSize * 3.2));
  let PLOT_W = $derived(VB_W - M - 10);
  let PLOT_H = $derived(VB_H - M_BOTTOM - 10);

  function px(hr: number): number {
    return M + ((hr - hrMin) / (hrMax - hrMin || 1)) * PLOT_W;
  }
  function py(pace: number): number {
    // Faster (lower pace) at top.
    return 10 + ((pace - paceMin) / (paceMax - paceMin || 1)) * PLOT_H;
  }

  let regression = $derived.by(() => {
    const n = points.length;
    if (n < 2) return null;
    const sumX = points.reduce((s, p) => s + p.hr, 0);
    const sumY = points.reduce((s, p) => s + p.pace, 0);
    const meanX = sumX / n;
    const meanY = sumY / n;
    let num = 0;
    let den = 0;
    for (const p of points) {
      num += (p.hr - meanX) * (p.pace - meanY);
      den += (p.hr - meanX) ** 2;
    }
    const slope = den !== 0 ? num / den : 0;
    const intercept = meanY - slope * meanX;
    let ssTot = 0;
    let ssRes = 0;
    for (const p of points) {
      const predicted = slope * p.hr + intercept;
      ssTot += (p.pace - meanY) ** 2;
      ssRes += (p.pace - predicted) ** 2;
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    return { slope, intercept, r2 };
  });

  let regressionPath = $derived.by(() => {
    if (!regression) return '';
    const y1 = regression.slope * hrMin + regression.intercept;
    const y2 = regression.slope * hrMax + regression.intercept;
    return `M${px(hrMin).toFixed(1)},${py(y1).toFixed(1)} L${px(hrMax).toFixed(1)},${py(y2).toFixed(1)}`;
  });

  let trendLabel = $derived.by(() => {
    if (!regression || points.length < 3) return null;
    const last = points[points.length - 1]!;
    const predicted = regression.slope * last.hr + regression.intercept;
    return last.pace < predicted ? { text: 'last run: above your trend', color: 'var(--accent-ink)' } : { text: 'last run: below your trend', color: 'var(--caution-ink)' };
  });

  let a11yLabel = $derived(
    `Aerobic efficiency scatter, ${points.length} runs, heart rate against pace` +
      (regression ? `, trend fit R squared ${regression.r2.toFixed(2)}` : '') +
      (trendLabel ? `, ${trendLabel.text}` : '')
  );

  let hoverIndex = $state<number | null>(null);
  let hoverPoint = $derived(hoverIndex !== null ? points[hoverIndex]! : null);

  // The nearest run to the pointer, within a finger's width - small dots are
  // hard to land on exactly, with a mouse and much more so with a finger.
  const PICK_RADIUS_PX = 28;
  function handleMove(e: MouseEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / VB_W, rect.height / VB_H);
    const ox = rect.left + (rect.width - VB_W * scale) / 2;
    const oy = rect.top + (rect.height - VB_H * scale) / 2;
    let best: number | null = null;
    let bestD = PICK_RADIUS_PX;
    points.forEach((p, i) => {
      const d = Math.hypot(ox + px(p.hr) * scale - e.clientX, oy + py(p.pace) * scale - e.clientY);
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    });
    hoverIndex = best;
  }
</script>

<div class="scatter-wrap" bind:clientWidth={containerWidth}>
  {#if points.length < 2}
    <div class="empty-state" style="padding: var(--space-10) var(--space-4);">Not enough running data with HR yet.</div>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <svg use:touchHover viewBox="0 0 {VB_W} {VB_H}" class="scatter-svg" style="--chart-label-fs: {labelFontSize}px" role="img" aria-label={a11yLabel} onmousemove={handleMove} onmouseleave={() => (hoverIndex = null)}>
      {#each [0.25, 0.5, 0.75] as f (f)}
        <line x1={M + f * PLOT_W} y1="10" x2={M + f * PLOT_W} y2={10 + PLOT_H} stroke="var(--line-soft)" stroke-width="1" vector-effect="non-scaling-stroke" />
        <line x1={M} y1={10 + f * PLOT_H} x2={M + PLOT_W} y2={10 + f * PLOT_H} stroke="var(--line-soft)" stroke-width="1" vector-effect="non-scaling-stroke" />
      {/each}

      <text x={M - 6} y="14" text-anchor="end" class="chart-axis-label">{formatPace(paceMin, unitSystem)}</text>
      <text x={M - 6} y={10 + PLOT_H} text-anchor="end" class="chart-axis-label">{formatPace(paceMax, unitSystem)}</text>
      <text x={M} y={VB_H - labelFontSize - 8} text-anchor="start" class="chart-axis-label">{Math.round(hrMin)} bpm</text>
      <text x={M + 0.5 * PLOT_W} y={VB_H - 4} text-anchor="middle" class="chart-axis-label">avg heart rate (bpm)</text>
      <text x={M + PLOT_W} y={VB_H - labelFontSize - 8} text-anchor="end" class="chart-axis-label">{Math.round(hrMax)} bpm</text>
      <text x={M - 6} y={10 + 0.5 * PLOT_H} text-anchor="end" dominant-baseline="middle" class="chart-axis-label">pace</text>

      {#if regressionPath}
        <path d={regressionPath} stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      {/if}

      {#each points as p, i (p.id)}
        {@const recent = i >= points.length - 5}
        {@const isLast = i === points.length - 1}
        <circle
          cx={px(p.hr)}
          cy={py(p.pace)}
          r={isLast ? 5 : 3.4}
          fill={isLast ? 'var(--accent)' : recent ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'none'}
          stroke={isLast ? 'var(--bg-well)' : recent ? 'var(--accent)' : 'var(--neutral-line)'}
          stroke-width={isLast ? 2 : 1}
        />
      {/each}
    </svg>
    {#if hoverPoint}
      <div class="chart-tooltip" style="left: {(px(hoverPoint.hr) / VB_W) * 100}%; top: {(py(hoverPoint.pace) / VB_H) * 100}%;">
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label">{formatDateShort(hoverPoint.date)}</span>
        </div>
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label">HR</span>
          <span class="chart-tooltip-value">{Math.round(hoverPoint.hr)} bpm</span>
        </div>
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label">Pace</span>
          <span class="chart-tooltip-value">{formatPace(hoverPoint.pace, unitSystem)}</span>
        </div>
      </div>
    {/if}
    {#if regression}
      <div class="scatter-footer" title="r² = {regression.r2.toFixed(2)}: how closely your runs follow the trend line (1 = exactly)">
        {#if offScale > 0}<span>{offScale} {offScale === 1 ? 'run' : 'runs'} off-scale (walking pace or GPS glitch), not plotted</span>{/if}
        {#if trendLabel}<span class="mono" style="margin-left: auto; color: {trendLabel.color};">{trendLabel.text}</span>{/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .scatter-wrap {
    position: relative;
  }
  .scatter-svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .scatter-footer {
    display: flex;
    margin-top: var(--space-4);
    font-size: var(--fs-xs);
    color: var(--ink-5);
  }
</style>
