<!-- IntensityStack.svelte - Trends "intensity distribution": share of weekly
     time per HR zone, normalised to 100%, Z1 at the bottom. Weeks with no
     zone data are dropped rather than left as a bare gap in the middle of
     the strip - same rationale as TrendVolumeChart. -->
<script lang="ts">
  import type { Activity } from '../lib/types';
  import { bucketIndexForDate } from '../lib/date-utils';
  import { ZONE_COLORS } from '../lib/hr-zones';

  interface Props {
    activities: Activity[];
    numWeeks: number;
  }

  let { activities, numWeeks }: Props = $props();

  let weeklyZones = $derived.by(() => {
    const buckets = Array.from({ length: numWeeks }, () => [0, 0, 0, 0, 0]);
    for (const a of activities) {
      if (a.timeInZoneSec.length !== 5) continue;
      const idx = bucketIndexForDate(a.date, numWeeks, 7);
      if (idx === null) continue;
      for (let z = 0; z < 5; z++) buckets[idx]![z]! += a.timeInZoneSec[z]!;
    }
    return buckets;
  });

  // Only the weeks that actually have zone data, oldest first.
  let visible = $derived(weeklyZones.filter((zones) => zones.reduce((s, v) => s + v, 0) > 0));

  const VB_W = 1000;
  const VB_H = 212;
  const M_LEFT = 8;
  const M_RIGHT = 8;
  const M_TOP = 8;
  const M_BOTTOM = 20;
  const PLOT_W = VB_W - M_LEFT - M_RIGHT;
  const PLOT_H = VB_H - M_TOP - M_BOTTOM;

  let slotW = $derived(PLOT_W / Math.max(1, visible.length));

  let stacks = $derived(
    visible.map((zones, i) => {
      const total = zones.reduce((s, v) => s + v, 0);
      const x = M_LEFT + i * slotW;
      const out: { x: number; y: number; h: number; color: string }[] = [];
      let yCursor = M_TOP + PLOT_H;
      for (let z = 0; z < 5; z++) {
        const h = (zones[z]! / total) * PLOT_H;
        yCursor -= h;
        out.push({ x, y: yCursor, h, color: ZONE_COLORS[z]! });
      }
      return out;
    })
  );

  let a11yLabel = $derived.by(() => {
    const tot = [0, 0, 0, 0, 0];
    for (const w of visible) w.forEach((v, z) => (tot[z]! += v));
    const sum = tot.reduce((s, v) => s + v, 0) || 1;
    return `Weekly intensity distribution, ${visible.length} weeks with zone data. Share of time: ${tot.map((v, z) => `Zone ${z + 1} ${Math.round((v / sum) * 100)}%`).join(', ')}`;
  });
</script>

{#if visible.length === 0}
  <div class="empty-state" style="padding: var(--space-10) var(--space-4);">No zone data in this range.</div>
{:else}
  <svg viewBox="0 0 {VB_W} {VB_H}" class="stack-svg" role="img" aria-label={a11yLabel}>
    {#each stacks as week, wi (wi)}
      {#each week as seg, si (si)}
        <rect x={seg.x} y={seg.y} width={slotW} height={seg.h} fill={seg.color} fill-opacity="0.82" />
        <rect x={seg.x} y={seg.y} width={slotW} height="1" fill="var(--bg-well)" />
      {/each}
    {/each}
  </svg>
  <div class="zone-key">
    {#each ZONE_COLORS as color, i (i)}
      <span class="zone-key-item"><span class="zone-key-swatch" style="background: {color};"></span>Z{i + 1}</span>
    {/each}
  </div>
{/if}

<style>
  .stack-svg {
    width: 100%;
    height: auto;
    display: block;
  }
</style>
