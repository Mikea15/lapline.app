<!-- TrendVolumeChart.svelte - Trends "weekly volume by sport": stacked hours
     per week (run/bike/swim) + a 3-week trailing-mean total line. Weeks with
     no activity at all are dropped from the axis rather than rendered as
     bare gaps - a wide date range (a year, "All") routinely has long
     stretches with nothing logged, and showing every one of those as an
     empty slot read as a rendering glitch rather than "no training here". -->
<script lang="ts">
  import type { Activity } from '../lib/types';
  import { bucketIndexForDate, bucketStartDate, formatDateShort } from '../lib/date-utils';
  import { sportFamily } from '../lib/sport-color';
  import { chartLabelFontSize, chartViewBoxHeight } from '../lib/chart-scale';

  interface Props {
    activities: Activity[];
    numWeeks: number;
    metric?: 'distance' | 'time';
  }

  let { activities, numWeeks, metric = 'time' }: Props = $props();

  let containerWidth = $state(0);

  const SPORTS: { key: 'running' | 'cycling' | 'pool-swim'; color: string }[] = [
    { key: 'running', color: 'var(--sport-running)' },
    { key: 'cycling', color: 'var(--sport-cycling)' },
    { key: 'pool-swim', color: 'var(--sport-pool-swim)' }
  ];

  let unitSuffix = $derived(metric === 'distance' ? 'km' : 'h');

  let weekly = $derived.by(() => {
    const buckets = Array.from({ length: numWeeks }, () => ({ running: 0, cycling: 0, 'pool-swim': 0 }) as Record<string, number>);
    for (const a of activities) {
      const idx = bucketIndexForDate(a.date, numWeeks, 7);
      if (idx === null) continue;
      const family = sportFamily(a.sport);
      if (family === 'running' || family === 'cycling' || family === 'pool-swim') {
        buckets[idx]![family]! += metric === 'distance' ? a.distanceKm : a.durationMin / 60;
      }
    }
    return buckets;
  });

  // Only the weeks that actually have something logged, oldest first - the
  // real bucket index (into the full `numWeeks` trailing window) travels
  // alongside each one so it can still be dated for the x-axis.
  let visible = $derived(
    weekly.map((w, idx) => ({ idx, w, total: SPORTS.reduce((s, sp) => s + w[sp.key]!, 0) })).filter((b) => b.total > 0)
  );
  let totals = $derived(visible.map((b) => b.total));
  let trailingMeanTotal = $derived(
    totals.map((_, i) => {
      const start = Math.max(0, i - 2);
      const slice = totals.slice(start, i + 1);
      return slice.reduce((s, v) => s + v, 0) / slice.length;
    })
  );

  const VB_W = 1000;
  const M_RIGHT = 8;

  let labelFontSize = $derived(chartLabelFontSize(VB_W, containerWidth));
  let VB_H = $derived(chartViewBoxHeight(VB_W, 200, containerWidth));

  let domainMax = $derived.by(() => {
    const peak = Math.max(1, ...totals);
    const step = metric === 'distance' ? 5 : 1.5;
    return Math.ceil((peak * 1.1) / step) * step;
  });

  // Margins fit the axis labels at their rendered size (viewBox units are
  // ~3x wider in real pixels on a phone than on a desktop panel, so fixed
  // margins clipped the y labels down to their "h" suffix there).
  let yLabelChars = $derived(`${domainMax.toFixed(1)} ${unitSuffix}`.length);
  let M_LEFT = $derived(Math.max(56, yLabelChars * labelFontSize * 0.6 + 10));
  let M_TOP = $derived(Math.max(8, labelFontSize * 0.6)); // room for the top tick's label, centred on its line
  let M_BOTTOM = $derived(Math.max(24, labelFontSize + 8));
  let PLOT_W = $derived(VB_W - M_LEFT - M_RIGHT);
  let PLOT_H = $derived(VB_H - M_TOP - M_BOTTOM);

  function py(v: number): number {
    return M_TOP + PLOT_H - (v / domainMax) * PLOT_H;
  }

  // As many y intervals (4, 2 or 1) as fit without labels touching.
  let yIntervals = $derived([4, 2, 1].find((n) => PLOT_H / n >= labelFontSize * 1.5) ?? 1);
  let yTicks = $derived(Array.from({ length: yIntervals + 1 }, (_, i) => (domainMax * (yIntervals - i)) / yIntervals));
  let slotW = $derived(PLOT_W / Math.max(1, visible.length));
  let barW = $derived(slotW * 0.6);

  function barX(i: number): number {
    return M_LEFT + i * slotW + slotW * 0.2;
  }

  let stacks = $derived(
    visible.map((b, i) => {
      const rects = SPORTS.map((sp) => ({ color: sp.color, v: b.w[sp.key]! })).filter((r) => r.v > 0);
      const out: { x: number; y: number; h: number; color: string }[] = [];
      let yCursor = py(0);
      for (const r of rects) {
        const h = (r.v / domainMax) * PLOT_H;
        yCursor -= h;
        out.push({ x: barX(i), y: yCursor, h, color: r.color });
      }
      return out;
    })
  );

  let meanLinePath = $derived(
    trailingMeanTotal.map((v, i) => `${i === 0 ? 'M' : 'L'}${(M_LEFT + (i + 0.5) * slotW).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
  );

  // Real calendar-week labels rather than a relative "w{n}" index - once
  // empty weeks are dropped, consecutive bars are no longer consecutive
  // weeks, so a plain running count would misrepresent the gaps between
  // them. Thinned to roughly 8 labels, and further when a label ("29 Aug")
  // plus a gap is wider than the slots it would span, so they never collide.
  let xTickStep = $derived(
    Math.max(1, Math.ceil(visible.length / 8), Math.ceil((6 * labelFontSize * 0.6 + labelFontSize) / slotW))
  );
  let xTicks = $derived(
    visible.map((b, i) => ({ i, label: formatDateShort(bucketStartDate(b.idx, numWeeks, 7)) })).filter((t) => t.i % xTickStep === 0)
  );
</script>

<div class="volume-wrap" bind:clientWidth={containerWidth}>
  {#if visible.length === 0}
    <div class="empty-state" style="padding: var(--space-10) var(--space-4);">No activity in this range.</div>
  {:else}
    <svg
      viewBox="0 0 {VB_W} {VB_H}"
      class="volume-svg"
      style="--chart-label-fs: {labelFontSize}px"
      role="img"
      aria-label="Weekly training volume by sport"
    >
      {#each yTicks as t (t)}
        <line x1={M_LEFT} y1={py(t)} x2={VB_W - M_RIGHT} y2={py(t)} stroke="var(--line-soft)" stroke-width="1" vector-effect="non-scaling-stroke" />
        <text x={M_LEFT - 8} y={py(t)} text-anchor="end" dominant-baseline="middle" class="chart-axis-label">{t.toFixed(1)} {unitSuffix}</text>
      {/each}

      {#each stacks as stack, i (i)}
        {#each stack as r, ri (ri)}
          <rect x={r.x} y={r.y} width={barW} height={r.h} fill={r.color} />
        {/each}
      {/each}

      <path d={meanLinePath} fill="none" stroke="var(--ink-1)" stroke-width="1.4" stroke-dasharray="4 3" opacity="0.55" vector-effect="non-scaling-stroke" />

      {#each xTicks as t (t.i)}
        <text x={M_LEFT + (t.i + 0.5) * slotW} y={VB_H - 6} text-anchor="middle" class="chart-axis-label">{t.label}</text>
      {/each}
    </svg>
  {/if}
</div>

<style>
  .volume-wrap {
    width: 100%;
  }
  .volume-svg {
    width: 100%;
    height: auto;
    display: block;
  }
</style>
