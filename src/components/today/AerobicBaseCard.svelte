<!-- AerobicBaseCard.svelte - Today's share of training time at or above HR
     zone 2 over the header's range: the figure, the full zone split with the
     z1/z2+ divide marked, and the change in points against the range before. -->
<script lang="ts">
  import KpiCard from './KpiCard.svelte';
  import { ZONE_COLORS } from '../../lib/hr-zones';

  interface Props {
    /** Seconds in zones 1-5 over the selected range, and the range before. */
    zones: number[];
    prevZones: number[];
    rangeLabel: string;
  }

  let { zones, prevZones, rangeLabel }: Props = $props();

  function z2PlusPct(z: number[]): number | null {
    const total = z.reduce((s, v) => s + v, 0);
    return total > 0 ? ((total - z[0]!) / total) * 100 : null;
  }

  let total = $derived(zones.reduce((s, v) => s + v, 0));
  let pct = $derived(z2PlusPct(zones));
  let prevPct = $derived(z2PlusPct(prevZones));
  let segments = $derived(zones.map((v, i) => ({ zone: i + 1, share: total > 0 ? (v / total) * 100 : 0, color: ZONE_COLORS[i]! })));
  let easyShare = $derived(segments[0]!.share);

  let deltaPts = $derived(pct !== null && prevPct !== null ? Math.round(pct - prevPct) : null);
  let chip = $derived(
    deltaPts === null ? null : { text: `${deltaPts > 0 ? '+' : ''}${deltaPts} pts`, tone: deltaPts > 0 ? ('positive' as const) : deltaPts < 0 ? ('caution' as const) : ('neutral' as const) }
  );
</script>

<KpiCard
  label="Aerobic base"
  tip="Share of training time over the selected range at or above heart-rate zone 2. The bar is the full zone split, with the line where zone 1 ends."
  edge="var(--positive)"
  meta="time in zone"
  {chip}
  caption={pct === null ? `no heart-rate zones in ${rangeLabel}` : deltaPts === null ? `over ${rangeLabel}` : `vs the ${rangeLabel} before`}
>
  <div class="kpi-value-row">
    <span class="kpi-value">{pct !== null ? Math.round(pct) : '—'}</span>
    <span class="kpi-unit">% in z2+</span>
  </div>
  {#if pct !== null}
    <div class="split">
      <div class="bar">
        {#each segments as seg (seg.zone)}
          {#if seg.share > 0}
            <span class="seg mono" style="flex: {seg.share} 0 0; background: {seg.color};">{seg.share >= 9 ? `z${seg.zone}` : ''}</span>
          {/if}
        {/each}
        {#if easyShare > 0 && easyShare < 100}
          <span class="divide" style="left: {easyShare}%;"></span>
        {/if}
      </div>
      <div class="legend mono">
        <span class="easy">easy {Math.round(easyShare)}%</span>
        <span class="hard">◂ z2+ {Math.round(pct)}% ▸</span>
      </div>
    </div>
  {/if}
</KpiCard>

<style>
  .split {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .bar {
    position: relative;
    display: flex;
    gap: var(--space-1);
    height: 22px;
  }
  .seg {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 1px;
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    color: var(--bg-app);
    overflow: hidden;
  }
  .divide {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    margin-left: -1px;
    background: var(--ink-1);
    border-radius: 1px;
  }
  .legend {
    display: flex;
    justify-content: space-between;
    font-size: var(--fs-xs);
  }
  .easy {
    color: var(--ink-6);
  }
  .hard {
    color: var(--ink-2);
    font-weight: var(--fw-semibold);
  }
</style>
