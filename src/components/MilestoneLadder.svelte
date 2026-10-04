<!-- MilestoneLadder.svelte - longest efforts per sport within the caller's
     selected date range. Each column ranks its sport's top 4 efforts by
     descending fill opacity (rank 4 is the plainest "4th longest", not a
     true median - a small, documented simplification of the design
     handoff's ladder). Rows are clickable through to the source activity
     when `onSelect` is given, with a hover tooltip stating the rank,
     distance, and date. -->
<script lang="ts">
  import { familyColorVar } from '../lib/sport-color';
  import { formatDistance, formatPoolDistance, type UnitSystem } from '../lib/units';
  import { formatDateDMY } from '../lib/date-utils';
  import type { MilestoneLadder, MilestoneEntry } from '../lib/records';

  interface Props {
    ladders: MilestoneLadder[];
    unitSystem: UnitSystem;
    onSelect?: (id: number) => void;
  }

  let { ladders, unitSystem, onSelect }: Props = $props();

  const RANK_LABELS = ['Longest', '2nd', '3rd', '4th'];
  const OPACITY = [1, 0.72, 0.52, 0.34];

  function sportName(sport: string): string {
    if (sport === 'pool-swim') return 'Pool Swim';
    return sport.charAt(0).toUpperCase() + sport.slice(1);
  }

  function formatEntry(ladder: MilestoneLadder, km: number): string {
    return ladder.sport === 'pool-swim' ? formatPoolDistance(km) : formatDistance(km, unitSystem, 2);
  }

  function entryTip(ladder: MilestoneLadder, entry: MilestoneEntry, rank: number): string {
    return `${RANK_LABELS[rank]} ${sportName(ladder.sport)} effort — ${formatEntry(ladder, entry.distanceKm)} on ${formatDateDMY(entry.date)}`;
  }
</script>

<div class="ladder-grid">
  {#each ladders as ladder (ladder.sport)}
    {#if ladder.entries.length > 0}
      <div class="ladder-column">
        <div class="ladder-head">
          <span class="ladder-sport">{sportName(ladder.sport)}</span>
          <span class="ladder-best mono">{formatEntry(ladder, ladder.entries[0]!.distanceKm)}</span>
        </div>
        {#each ladder.entries as entry, i (i)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="ladder-row"
            class:clickable={!!onSelect}
            onclick={() => onSelect?.(entry.activityId)}
            role={onSelect ? 'button' : undefined}
            tabindex={onSelect ? 0 : undefined}
            onkeydown={(e) => {
              if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(entry.activityId);
              }
            }}
          >
            <span class="ladder-label">{RANK_LABELS[i]}</span>
            <div class="ladder-meter">
              <div
                class="ladder-meter-fill"
                style="width: {(entry.distanceKm / ladder.entries[0]!.distanceKm) * 100}%; background: {familyColorVar(ladder.sport)}; opacity: {OPACITY[i]};"
              ></div>
            </div>
            <span class="ladder-value mono">{formatEntry(ladder, entry.distanceKm)}</span>
            <div class="chart-tooltip ladder-tooltip">{entryTip(ladder, entry, i)}</div>
          </div>
        {/each}
      </div>
    {/if}
  {/each}
</div>

<style>
  .ladder-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-6) var(--space-9);
  }
  .ladder-column {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .ladder-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--line-soft);
  }
  .ladder-sport {
    font-family: var(--font-sans);
    font-weight: var(--fw-medium);
    font-size: var(--fs-base);
    color: var(--ink-2);
  }
  .ladder-best {
    font-size: var(--fs-base);
    color: var(--ink-1);
    white-space: nowrap;
  }
  .ladder-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: 0 var(--space-2);
    margin: 0 -4px;
    border-radius: 3px;
  }
  .ladder-row.clickable {
    cursor: pointer;
  }
  /* A tap target on a phone; the rows are too close together for hit areas. */
  @media (max-width: 720px) {
    .ladder-row.clickable {
      min-height: 44px;
    }
  }
  .ladder-row.clickable:hover,
  .ladder-row.clickable:focus-visible {
    background: var(--bg-well);
  }
  .chart-tooltip {
    position: absolute;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-3) var(--space-5);
    font-family: var(--font-sans);
    font-size: var(--fs-sm);
    color: var(--ink-1);
    line-height: 1.4;
    white-space: nowrap;
    pointer-events: none;
    z-index: 5;
  }
  .ladder-tooltip {
    left: 50%;
    top: 100%;
    transform: translate(-50%, 6px);
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.1s ease;
  }
  .ladder-row.clickable:hover .ladder-tooltip,
  .ladder-row.clickable:focus-visible .ladder-tooltip {
    opacity: 1;
    visibility: visible;
  }
  .ladder-label {
    width: 48px;
    flex-shrink: 0;
    font-family: var(--font-sans);
    font-size: var(--fs-sm);
    color: var(--ink-5);
  }
  .ladder-meter {
    flex: 1;
    height: 8px;
    background: var(--bg-well);
    border-radius: 1px;
    overflow: hidden;
  }
  .ladder-meter-fill {
    height: 100%;
  }
  .ladder-value {
    width: 64px;
    flex-shrink: 0;
    text-align: right;
    font-size: var(--fs-sm);
    color: var(--ink-2);
    white-space: nowrap;
  }
</style>
