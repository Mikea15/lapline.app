<!-- ChronicLoadCard.svelte - Today's chronic (42-day) load: the figure, its
     weekly trend with the safe-ramp band, and how fast it has built over
     the last 4 weeks against the 8%/week rule of thumb. -->
<script lang="ts">
  import KpiCard from './KpiCard.svelte';
  import { chronicRamp, SAFE_RAMP_PER_WEEK, type RampStatus } from '../../lib/today-kpis';

  interface Props {
    /** Chronic load, one value per week, oldest first; the last is now. */
    series: number[];
  }

  let { series }: Props = $props();

  const RAMP_WEEKS = 4;

  let current = $derived(series[series.length - 1] ?? 0);
  let ramp = $derived(chronicRamp(series, RAMP_WEEKS));

  const STATUS: Record<RampStatus, { text: string; color: string }> = {
    steep: { text: 'Steep ramp', color: 'var(--caution)' },
    building: { text: 'Building', color: 'var(--positive)' },
    steady: { text: 'Steady', color: 'var(--ink-4)' },
    easing: { text: 'Easing', color: 'var(--zone-1)' }
  };
  let status = $derived(STATUS[ramp.status]);

  // The trend chart. The band is how high load could safely be by now: the
  // value 4 weeks ago built at 8%/week. A line above the band is a ramp
  // steeper than that.
  const W = 300;
  const H = 60;
  let baseIdx = $derived(series.length - 1 - RAMP_WEEKS);
  let ceiling = $derived(baseIdx >= 0 && series[baseIdx]! > 0 ? series[baseIdx]! * Math.pow(1 + SAFE_RAMP_PER_WEEK, RAMP_WEEKS) : null);
  let yMax = $derived(Math.max(1, ...series, ceiling ?? 0) * 1.08);
  const x = (i: number, n: number) => (n > 1 ? (i / (n - 1)) * W : W);
  let y = $derived((v: number) => H - (v / yMax) * H);
  let linePath = $derived(series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, series.length).toFixed(1)},${y(v).toFixed(1)}`).join(' '));
  let areaPath = $derived(series.length > 1 ? `${linePath} L${W},${H} L0,${H} Z` : '');

  let chip = $derived(
    ramp.changePct === null
      ? null
      : { text: `${ramp.changePct >= 0 ? '+' : ''}${ramp.changePct.toFixed(1)}%`, tone: ramp.status === 'steep' ? ('caution' as const) : ramp.changePct >= 0 ? ('positive' as const) : ('neutral' as const) }
  );
  let caption = $derived(ramp.changePct === null ? 'not enough history for a trend yet' : `in ${RAMP_WEEKS}w · safe is ≤ ${SAFE_RAMP_PER_WEEK * 100}%/wk`);
</script>

<KpiCard
  label="Chronic load"
  tip="6-week trailing average of your weekly training load: your longer-term fitness baseline. The band is where it could safely be by now, building at most 8% a week from 4 weeks ago (the dotted line)."
  edge={status.color}
  badge={series.length > 0 && current > 0 ? status : null}
  {chip}
  {caption}
>
  <div class="kpi-value-row">
    <span class="kpi-value">{Math.round(current)}</span>
    <span class="kpi-unit">au · 42d</span>
  </div>
  {#if series.length > 1}
    <div class="chart">
      <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
        {#if ceiling !== null}
          <rect x="0" y={y(ceiling)} width={W} height={H - y(ceiling)} class="band" />
          <line x1={x(baseIdx, series.length)} x2={x(baseIdx, series.length)} y1="0" y2={H} class="marker" vector-effect="non-scaling-stroke" />
        {/if}
        <path d={areaPath} class="area" style="fill: {status.color};" />
        <path d={linePath} class="line" style="stroke: {status.color};" vector-effect="non-scaling-stroke" />
      </svg>
      <span class="end-dot" style="top: {(y(current) / H) * 100}%; background: {status.color};"></span>
    </div>
  {/if}
</KpiCard>

<style>
  .chart {
    position: relative;
    height: 44px;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .band {
    fill: var(--positive);
    opacity: 0.07;
  }
  .marker {
    stroke: var(--ink-6);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }
  .area {
    opacity: 0.1;
  }
  .line {
    fill: none;
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .end-dot {
    position: absolute;
    right: -3px;
    width: 6px;
    height: 6px;
    margin-top: -3px;
    border-radius: 50%;
  }
</style>
