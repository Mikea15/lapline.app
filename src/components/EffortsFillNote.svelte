<!-- EffortsFillNote.svelte - calm stand-in for anything computed from best
     efforts while the one-off background fill runs (the first boot after the
     v8 upgrade; see lib/efforts-store.ts): "Working out your best efforts...
     340 of 2,000" with a thin progress bar. `height` sizes it to the chart or
     card body it replaces; `compact` drops the box and bar for a card. -->
<script lang="ts">
  import { effortsFill } from '../lib/efforts-progress.svelte';

  interface Props {
    height?: string;
    compact?: boolean;
  }

  let { height, compact = false }: Props = $props();

  const fmt = (n: number) => n.toLocaleString('en-GB');
  let progress = $derived(effortsFill.total > 0 ? Math.min(1, effortsFill.done / effortsFill.total) : 0);
</script>

<div class="fill-note" class:compact style:min-height={height} role="status">
  <span class="fill-text">Working out your best efforts…</span>
  {#if effortsFill.total > 0}
    <span class="fill-count mono">{fmt(effortsFill.done)} of {fmt(effortsFill.total)}</span>
    {#if !compact}
      <span class="fill-bar" aria-hidden="true"><span class="fill-bar-value" style:width="{progress * 100}%"></span></span>
    {/if}
  {/if}
</div>

<style>
  .fill-note {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-4);
    border: 1px dashed var(--line-panel);
    border-radius: var(--radius);
    background: var(--bg-well);
    color: var(--ink-4);
    font-size: var(--fs-sm);
    text-align: center;
  }
  .fill-note.compact {
    align-items: flex-start;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .fill-count {
    font-size: var(--fs-xs);
    color: var(--ink-5);
  }
  .fill-bar {
    width: min(220px, 80%);
    height: 3px;
    border-radius: 2px;
    background: var(--line-soft);
    overflow: hidden;
  }
  .fill-bar-value {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.4s ease;
  }
</style>
