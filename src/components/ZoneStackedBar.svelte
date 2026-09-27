<!-- ZoneStackedBar.svelte - one bar split into flex-weighted zone segments
     (Today's "weekly time in zone" bar). Each segment is labelled Z1..Z5 in
     dark-on-color text when it's wide enough to hold it. -->
<script lang="ts">
  import { ZONE_COLORS } from '../lib/hr-zones';

  interface Props {
    /** Seconds (or any consistent unit) per zone, index 0 = Z1 .. index 4 = Z5. */
    values: number[];
    height?: number;
  }

  let { values, height = 26 }: Props = $props();

  let total = $derived(values.reduce((s, v) => s + v, 0));
  let segments = $derived(
    values.map((v, i) => ({
      zone: i + 1,
      color: ZONE_COLORS[i]!,
      percent: total > 0 ? (v / total) * 100 : 0
    }))
  );
</script>

{#if total > 0}
  <div class="zone-bar" style="height: {height}px;">
    {#each segments as seg (seg.zone)}
      {#if seg.percent > 0}
        <div class="zone-bar-segment" style="flex: {seg.percent} 0 0; background: {seg.color};">
          {#if seg.percent > 6}
            <span class="zone-bar-label">Z{seg.zone}</span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .zone-bar {
    display: flex;
    width: 100%;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .zone-bar-segment {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }
  .zone-bar-label {
    font-family: var(--font-mono);
    font-weight: var(--fw-medium);
    font-size: var(--fs-xs);
    color: var(--bg-app);
  }
</style>
