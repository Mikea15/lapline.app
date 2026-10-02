<!-- MiniBars.svelte - the small bar chart inside a KPI card (Calendar and
     Trends top rows), styled like Today's Run volume card: faint bars, the
     highlighted one at full colour, a dashed average line. -->
<script lang="ts">
  export interface MiniBar {
    value: number;
    title: string;
    /** Full colour for this bar (else the row's faint colour). */
    color?: string;
  }

  interface Props {
    bars: MiniBar[];
    /** The bars' base colour. */
    color: string;
    /** Draw this bar at full colour (e.g. the peak or the current week). */
    highlight?: number;
    showAverage?: boolean;
  }

  let { bars, color, highlight = -1, showAverage = true }: Props = $props();

  let max = $derived(Math.max(0, ...bars.map((b) => b.value)));
  let avg = $derived(bars.length > 0 ? bars.reduce((s, b) => s + b.value, 0) / bars.length : 0);
</script>

<div class="bars">
  {#if showAverage && max > 0}
    <span class="avg" style="bottom: {(avg / max) * 100}%;"></span>
  {/if}
  {#each bars as bar, i (i)}
    <span
      class="bar"
      style="height: {max > 0 ? Math.max(bar.value > 0 ? 4 : 0, (bar.value / max) * 100) : 0}%; background: {bar.color ??
        (i === highlight ? color : `color-mix(in srgb, ${color} 38%, var(--bg-panel))`)};"
      title={bar.title}
    ></span>
  {/each}
</div>

<style>
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
    border-radius: 1px 1px 0 0;
  }
</style>
