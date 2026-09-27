<!-- HrDensity.svelte - heart-rate density histogram (Atlas stats sheet,
     design_handoff_atlas/README.md section 5c): how much of the activity
     was spent at each bpm, one bar per bin, each scaled against the busiest
     (modal) bin so the most common range always reads full-width. Each row
     carries a real hover/focus tooltip (zone, real duration, real share of
     the activity) plus an always-present aria-label with the same real
     numbers, so the data isn't hover-only for keyboard/screen-reader use. -->
<script lang="ts">
  import { buildHrDensityBins } from '../lib/hr-density';
  import { ZONE_COLORS, ZONE_NAMES } from '../lib/hr-zones';
  import { formatClock } from '../lib/date-utils';

  interface Props {
    hr: number[];
    hrZoneBoundaries: number[];
  }

  let { hr, hrZoneBoundaries }: Props = $props();

  let bins = $derived(buildHrDensityBins(hr, hrZoneBoundaries));
  let hasData = $derived(bins.some((b) => b.count > 0));
  // Real per-second sample count backing this histogram (>0 bpm readings
  // only) - the denominator for each bin's real "% of activity" figure.
  let totalCount = $derived(bins.reduce((s, b) => s + b.count, 0));

  let hoverIndex = $state<number | null>(null);

  function zoneName(zone: number): string {
    return zone >= 0 ? ZONE_NAMES[zone]! : 'below Z1';
  }

  function rowLabel(bin: (typeof bins)[number]): string {
    const pct = totalCount > 0 ? Math.round((bin.count / totalCount) * 100) : 0;
    return `${Math.round(bin.bpmLo)}–${Math.round(bin.bpmHi)} bpm, ${zoneName(bin.zone)}, ${formatClock(bin.count)} (${pct}%)`;
  }
</script>

{#if hasData}
  <div class="hr-density">
    {#each bins as bin, i (i)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="hr-density-row"
        tabindex="0"
        aria-label={rowLabel(bin)}
        onmouseenter={() => (hoverIndex = i)}
        onmouseleave={() => (hoverIndex = null)}
        onfocus={() => (hoverIndex = i)}
        onblur={() => (hoverIndex = null)}
      >
        <span class="hr-density-label mono">{Math.round(bin.bpmLo)}</span>
        <div class="hr-density-track">
          <div
            class="hr-density-fill"
            style="width: {Math.max(bin.widthFrac * 100, bin.count > 0 ? 2 : 0)}%; background: {bin.zone >= 0 ? ZONE_COLORS[bin.zone] : 'var(--ink-5)'}; opacity: {bin.count > 0 ? 1 : 0.2};"
          ></div>
        </div>
        {#if hoverIndex === i}
          <div class="chart-tooltip">
            <div class="chart-tooltip-row">
              <span class="chart-tooltip-label">{Math.round(bin.bpmLo)}–{Math.round(bin.bpmHi)} bpm · {zoneName(bin.zone)}</span>
            </div>
            <div class="chart-tooltip-row">
              <span class="chart-tooltip-value">{formatClock(bin.count)}{totalCount > 0 ? ` · ${Math.round((bin.count / totalCount) * 100)}%` : ''}</span>
            </div>
          </div>
        {/if}
      </div>
    {/each}
    <div class="hr-density-caption mono">time spent at each bpm</div>
  </div>
{:else}
  <div class="empty-state">No heart-rate data for this activity.</div>
{/if}

<style>
  .hr-density {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .hr-density-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    border-radius: 2px;
  }
  .hr-density-row:hover,
  .hr-density-row:focus-visible {
    background: var(--bg-row-hover);
    outline: none;
  }
  .hr-density-label {
    width: 24px;
    flex-shrink: 0;
    font-size: var(--fs-xs);
    color: var(--ink-6);
    text-align: right;
  }
  .hr-density-track {
    flex: 1;
    height: 9px;
    background: var(--bg-well);
    border-radius: 1px;
    overflow: hidden;
  }
  .hr-density-fill {
    height: 100%;
    border-radius: 1px;
  }
  .hr-density-caption {
    margin-top: var(--space-3);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-6);
    text-align: center;
  }
  .chart-tooltip {
    left: 34px;
    top: 50%;
    transform: translateY(-50%);
    margin-top: 0;
  }
</style>
