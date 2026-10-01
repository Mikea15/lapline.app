<!-- KpiCard.svelte - the frame shared by Today's six KPI cards: a coloured
     left edge, the label (with its explainer) and either a quiet meta note
     or a status badge on the right, the card's own body, and a footer of
     one highlighted chip plus a caption. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import InfoLabel from '../InfoLabel.svelte';

  export type ChipTone = 'positive' | 'caution' | 'neutral';

  interface Props {
    label: string;
    tip: string;
    /** The left edge's colour (a CSS colour or var()). */
    edge: string;
    meta?: string;
    badge?: { text: string; color: string } | null;
    chip?: { text: string; tone: ChipTone } | null;
    caption?: string;
    children: Snippet;
  }

  let { label, tip, edge, meta = '', badge = null, chip = null, caption = '', children }: Props = $props();
</script>

<section class="kpi-card" style="--edge: {edge};">
  <div class="kpi-head">
    <InfoLabel class="stat-cell-label" text={label} {tip} openBelow />
    {#if badge}
      <span class="kpi-badge mono" style="--badge: {badge.color};">{badge.text}</span>
    {:else if meta}
      <span class="kpi-meta mono">{meta}</span>
    {/if}
  </div>
  <div class="kpi-body">
    {@render children()}
  </div>
  {#if chip || caption}
    <div class="kpi-foot">
      {#if chip}<span class="kpi-chip mono {chip.tone}">{chip.text}</span>{/if}
      {#if caption}<span class="kpi-caption mono" title={caption}>{caption}</span>{/if}
    </div>
  {/if}
</section>

<style>
  .kpi-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    min-width: 0;
    background: var(--bg-panel);
    border: 1px solid var(--line-panel);
    border-left: 2px solid var(--edge);
    border-radius: var(--radius);
    padding: var(--space-7) var(--space-8);
  }
  .kpi-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    min-height: 20px;
  }
  .kpi-meta {
    font-size: var(--fs-xs);
    color: var(--ink-6);
    white-space: nowrap;
  }
  .kpi-badge {
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--badge);
    border: 1px solid color-mix(in srgb, var(--badge) 55%, transparent);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    white-space: nowrap;
  }
  .kpi-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    min-width: 0;
  }
  .kpi-foot {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    min-width: 0;
  }
  .kpi-chip {
    flex: none;
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    padding: var(--space-1) var(--space-4);
    border-radius: var(--radius-sm);
  }
  .kpi-chip.positive {
    background: var(--positive);
    color: var(--bg-app);
  }
  .kpi-chip.caution {
    background: var(--caution);
    color: var(--bg-app);
  }
  .kpi-chip.neutral {
    background: var(--bg-row-hover);
    color: var(--ink-1);
  }
  .kpi-caption {
    font-size: var(--fs-xs);
    color: var(--ink-5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The big figure and its unit, shared by every card. */
  .kpi-card :global(.kpi-value-row) {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    white-space: nowrap;
  }
  .kpi-card :global(.kpi-value) {
    font-family: var(--font-mono);
    font-size: var(--fs-3xl);
    letter-spacing: var(--tracking-tight);
    line-height: 1;
    color: var(--ink-1);
  }
  .kpi-card :global(.kpi-unit) {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    color: var(--ink-5);
  }
</style>
