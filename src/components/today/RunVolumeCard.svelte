<!-- RunVolumeCard.svelte - Today's running distance over the default range,
     with bars per day, week or month (by range length - lib/today-kpis.ts),
     a dotted average line, and the peak bar picked out. -->
<script lang="ts">
  import KpiCard from './KpiCard.svelte';
  import type { Activity } from '../../lib/types';
  import { runVolumeBars } from '../../lib/today-kpis';
  import { settingsStore } from '../../lib/stores.svelte';
  import { toDisplayDistance, distanceUnit } from '../../lib/units';

  interface Props {
    activities: Activity[];
    rangeDays: number;
    rangeLabel: string;
    totalKm: number;
  }

  let { activities, rangeDays, rangeLabel, totalKm }: Props = $props();

  let volume = $derived(runVolumeBars(activities, rangeDays));
  let bars = $derived(volume.bars);
  let max = $derived(Math.max(0, ...bars.map((b) => b.km)));
  let peakIdx = $derived(max > 0 ? bars.findIndex((b) => b.km === max) : -1);
  let avg = $derived(bars.length > 0 ? totalKm / bars.length : 0);
  let unitSystem = $derived(settingsStore.getUnitSystem());
  let unit = $derived(distanceUnit(unitSystem));
  const dist = (km: number) => toDisplayDistance(km, unitSystem).toFixed(1);
  const PER: Record<string, string> = { day: 'day', week: 'wk', month: 'mo' };

  let caption = $derived.by(() => {
    if (peakIdx < 0) return `no runs in ${rangeLabel}`;
    const peak = bars[peakIdx]!;
    return volume.bucket === 'month' ? `avg · ${peak.title.slice(0, 3)} was the peak` : `avg · peak ${peak.title}`;
  });
</script>

<KpiCard
  label="Run volume"
  tip="Total running distance over your default range (Settings > Default time range), split into bars by day, week or month. The dotted line is the average bar."
  edge="var(--sport-running)"
  meta={rangeLabel}
  chip={peakIdx < 0 ? null : { text: `${dist(avg)} ${unit}/${PER[volume.bucket]}`, tone: 'neutral' }}
  {caption}
>
  <div class="kpi-value-row">
    <span class="kpi-value">{dist(totalKm)}</span>
    <span class="kpi-unit">{unit}</span>
  </div>
  <div class="chart">
    <div class="bars">
      {#if max > 0}
        <span class="avg" style="bottom: {(avg / max) * 100}%;"></span>
      {/if}
      {#each bars as bar, i (i)}
        <span
          class="bar"
          class:peak={i === peakIdx}
          class:current={bar.current && i !== peakIdx}
          style="height: {max > 0 ? Math.max(bar.km > 0 ? 4 : 0, (bar.km / max) * 100) : 0}%;"
          title="{bar.title}: {dist(bar.km)} {unit}"
        ></span>
      {/each}
    </div>
    {#if volume.bucket === 'month'}
      <div class="labels">
        {#each bars as bar, i (i)}
          <span class="label mono" class:peak={i === peakIdx}>{bar.label}</span>
        {/each}
      </div>
    {/if}
  </div>
</KpiCard>

<style>
  .chart {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .bars {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: var(--space-1);
    height: 40px;
    border-bottom: 1px solid var(--line-soft);
  }
  .avg {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px dashed var(--ink-6);
    pointer-events: none;
  }
  .bar {
    flex: 1;
    min-width: 0;
    background: color-mix(in srgb, var(--sport-running) 38%, var(--bg-panel));
    border-radius: 1px 1px 0 0;
  }
  .bar.peak {
    background: var(--sport-running);
  }
  .bar.current {
    background: var(--neutral-bar-last);
  }
  .labels {
    display: flex;
    gap: var(--space-1);
  }
  .label {
    flex: 1;
    min-width: 0;
    text-align: center;
    font-size: var(--fs-xs);
    color: var(--ink-6);
  }
  .label.peak {
    color: var(--sport-running);
    font-weight: var(--fw-semibold);
  }
</style>
