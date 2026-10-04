<!-- AerobicBaseCard.svelte - Today's share of training time in HR zone 2
     over the default range: the figure, the full zone split with zone 2
     picked out, and the change in points against the range before. -->
<script lang="ts">
  import KpiCard from './KpiCard.svelte';
  import { ZONE_COLORS, ZONE_ON } from '../../lib/hr-zones';

  interface Props {
    /** Seconds in zones 1-5 over the selected range, and the range before. */
    zones: number[];
    prevZones: number[];
    rangeLabel: string;
  }

  let { zones, prevZones, rangeLabel }: Props = $props();

  function z2Pct(z: number[]): number | null {
    const total = z.reduce((s, v) => s + v, 0);
    return total > 0 ? (z[1]! / total) * 100 : null;
  }

  let total = $derived(zones.reduce((s, v) => s + v, 0));
  let pct = $derived(z2Pct(zones));
  let prevPct = $derived(z2Pct(prevZones));
  let segments = $derived(zones.map((v, i) => ({ zone: i + 1, share: total > 0 ? (v / total) * 100 : 0, color: ZONE_COLORS[i]!, on: ZONE_ON[i]! })));
  let belowShare = $derived(segments[0]!.share);
  let aboveShare = $derived(segments.slice(2).reduce((s, seg) => s + seg.share, 0));

  let deltaPts = $derived(pct !== null && prevPct !== null ? Math.round(pct - prevPct) : null);
  let chip = $derived(
    deltaPts === null ? null : { text: `${deltaPts > 0 ? '+' : ''}${deltaPts} pts`, tone: deltaPts > 0 ? ('positive' as const) : deltaPts < 0 ? ('caution' as const) : ('neutral' as const) }
  );
</script>

<KpiCard
  label="Aerobic base"
  tip="Share of your training time in heart-rate zone 2, the steady, conversational effort that builds endurance. The bar shows your full zone split."
  edge="var(--positive)"
  meta="time in zone"
  {chip}
  caption={pct === null ? `no heart-rate zones in ${rangeLabel}` : deltaPts === null ? `over ${rangeLabel}` : `vs the ${rangeLabel} before`}
>
  <div class="kpi-value-row">
    <span class="kpi-value">{pct !== null ? Math.round(pct) : '—'}</span>
    <span class="kpi-unit">% in z2</span>
  </div>
  {#if pct !== null}
    <div class="split">
      <div class="bar">
        {#each segments as seg (seg.zone)}
          {#if seg.share > 0}
            <span class="seg mono" class:base={seg.zone === 2} style="flex: {seg.share} 0 0; --seg: {seg.color}; --seg-on: {seg.on};">{seg.share >= 9 ? `z${seg.zone}` : ''}</span>
          {/if}
        {/each}
      </div>
      <div class="legend mono">
        <span class="other">z1 {Math.round(belowShare)}%</span>
        <span class="other">z3-5 {Math.round(aboveShare)}%</span>
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
    /* Context zones: a faint tint with neutral text (a faded fill dragged
       the label under 4.5:1). */
    background: color-mix(in srgb, var(--seg) 22%, transparent);
    color: var(--ink-3);
    overflow: hidden;
  }
  /* Zone 2 is the figure; the other zones stay as context. */
  .seg.base {
    background: var(--seg);
    color: var(--seg-on);
  }
  .legend {
    display: flex;
    justify-content: space-between;
    font-size: var(--fs-xs);
  }
  .other {
    color: var(--ink-5);
  }
</style>
