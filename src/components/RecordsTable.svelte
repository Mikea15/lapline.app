<!-- RecordsTable.svelte - all-time personal records with a progression sparkline. -->
<script lang="ts">
  import Sparkline from './Sparkline.svelte';
  import Skeleton from './Skeleton.svelte';
  import { familyColorVar } from '../lib/sport-color';
  import { formatSpeed, toDisplayDistance, toDisplaySpeed, distanceUnit, speedUnit, type UnitSystem } from '../lib/units';
  import { formatDateDMY, daysAgo } from '../lib/date-utils';
  import type { RecordResult } from '../lib/records';
  import { phone } from '../lib/viewport.svelte';

  interface Props {
    records: RecordResult[];
    unitSystem: UnitSystem;
    onSelect: (id: number) => void;
  }

  let { records, unitSystem, onSelect }: Props = $props();

  function formatBest(r: RecordResult): string {
    if (r.bestValue === null) return '—';
    if (r.kind === 'pace-distance') {
      const m = Math.floor(r.bestValue / 60);
      const s = Math.round(r.bestValue % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    }
    if (r.kind === 'fastest-avg-speed') return formatSpeed(r.bestValue, unitSystem, 1);
    if (r.sport === 'pool-swim') return `${Math.round(r.bestValue * 1000)}`;
    return toDisplayDistance(r.bestValue, unitSystem).toFixed(2);
  }

  function formatGain(r: RecordResult): string {
    if (r.previousValue === null || r.bestValue === null) return '—';
    const diff = r.bestValue - r.previousValue;
    if (r.kind === 'pace-distance') {
      return `${diff < 0 ? '−' : '+'}${Math.abs(Math.round(diff))} s`;
    }
    if (r.kind === 'fastest-avg-speed') {
      return `${diff >= 0 ? '+' : '−'}${Math.abs(toDisplaySpeed(diff, unitSystem)).toFixed(1)} ${speedUnit(unitSystem)}`;
    }
    if (r.sport === 'pool-swim') {
      return `${diff >= 0 ? '+' : '−'}${Math.abs(Math.round(diff * 1000))} m`;
    }
    return `${diff >= 0 ? '+' : '−'}${Math.abs(toDisplayDistance(diff, unitSystem)).toFixed(2)} ${distanceUnit(unitSystem)}`;
  }

  function sparklineData(r: RecordResult): number[] {
    const values = r.history.map((h) => h.value);
    return r.kind === 'pace-distance' ? values.map((v) => -v) : values;
  }

  function isNew(r: RecordResult): boolean {
    return r.setDate !== null && daysAgo(r.setDate) <= 14;
  }
</script>

{#snippet recordRow(r: RecordResult)}
  <span class="sport-bar records-item-bar" style="background: {familyColorVar(r.sport)};"></span>
  <span class="records-item-main">
    <span class="records-item-top">
      <span class="record-label">{r.label}</span>
      {#if !r.loading && isNew(r)}<span class="new-flag">NEW</span>{/if}
      <span class="record-value mono">
        {#if r.loading}<Skeleton width="46px" height="13px" />{:else}{formatBest(r)}{/if}
      </span>
    </span>
    {#if !r.loading && r.setDate}
      <span class="records-item-meta mono">
        <span>{formatDateDMY(r.setDate)}</span>
        {#if formatGain(r) !== '—'}<span>{formatGain(r)}</span>{/if}
      </span>
    {/if}
  </span>
  <!-- Always takes its slot, so best values line up down the list. -->
  <span class="records-item-spark">
    {#if !r.loading && r.history.length > 1}
      <Sparkline data={sparklineData(r)} color={familyColorVar(r.sport)} width={72} height={24} />
    {/if}
  </span>
{/snippet}

{#if phone.current}
  <!-- Phone: record and best value on top, set date and gain under them,
       the progression sparkline on the right - no sideways scrolling. -->
  <ul class="records-list">
    {#each records as r (r.key)}
      <li class:row-active={!r.loading && isNew(r)}>
        {#if !r.loading && r.setByActivityId !== null}
          {@const id = r.setByActivityId}
          <button type="button" class="records-item" onclick={() => onSelect(id)}>{@render recordRow(r)}</button>
        {:else}
          <div class="records-item">{@render recordRow(r)}</div>
        {/if}
      </li>
    {/each}
  </ul>
{:else}
<div class="table-wrap">
  <table style="min-width: 560px;">
    <thead>
      <tr>
        <th style="text-align: left;">Record</th>
        <th>Best</th>
        <th>Set</th>
        <th>Gain</th>
        <th style="text-align: left; width: 130px;">Progression</th>
      </tr>
    </thead>
    <tbody>
      {#each records as r (r.key)}
        <tr
          class:row-active={isNew(r)}
          class:clickable-row={!r.loading && r.setByActivityId !== null}
          onclick={() => !r.loading && r.setByActivityId !== null && onSelect(r.setByActivityId)}
          role={!r.loading && r.setByActivityId !== null ? 'button' : undefined}
          tabindex={!r.loading && r.setByActivityId !== null ? 0 : undefined}
        >
          <td style="text-align: left;">
            <div class="record-cell">
              <span class="sport-bar" style="background: {familyColorVar(r.sport)};"></span>
              <span class="record-label">{r.label}</span>
              {#if !r.loading && isNew(r)}<span class="new-flag">NEW</span>{/if}
            </div>
          </td>
          {#if r.loading}
            <td><Skeleton width="46px" height="13px" /></td>
            <td><Skeleton width="60px" height="13px" /></td>
            <td><Skeleton width="42px" height="13px" /></td>
            <td style="text-align: left;"><Skeleton width="100px" height="20px" /></td>
          {:else}
            <td class="record-value">{formatBest(r)}</td>
            <td>{r.setDate ? formatDateDMY(r.setDate) : '—'}</td>
            <td>{formatGain(r)}</td>
            <td style="text-align: left;">
              {#if r.history.length > 1}
                <Sparkline data={sparklineData(r)} color={familyColorVar(r.sport)} width={120} height={26} />
              {:else}
                <span class="mono" style="color: var(--ink-7);">—</span>
              {/if}
            </td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
{/if}

<style>
  .record-cell {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .sport-bar {
    width: 2px;
    height: 14px;
    border-radius: 1px;
    flex-shrink: 0;
  }
  .record-label {
    font-family: var(--font-sans);
    font-weight: var(--fw-medium);
    font-size: var(--fs-base);
    color: var(--ink-1);
    white-space: nowrap;
  }
  .new-flag {
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xs);
    color: var(--accent);
  }
  .record-value {
    font-size: var(--fs-lg);
    color: var(--ink-1);
  }

  .records-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .records-list li + li {
    border-top: 1px solid var(--line-row);
  }
  .records-list li.row-active {
    background: var(--bg-row-active);
  }
  .records-item {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    width: 100%;
    padding: var(--space-5) var(--space-2);
    border: none;
    border-radius: 0;
    text-align: left;
  }
  button.records-item:active {
    background: var(--bg-row-hover);
  }
  .records-item-bar {
    align-self: stretch;
    height: auto;
  }
  .records-item-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .records-item-top {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
  }
  .records-item-top .record-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .records-item-top .record-value {
    margin-left: auto;
    flex-shrink: 0;
  }
  .records-item-meta {
    display: flex;
    gap: var(--space-5);
    font-size: var(--fs-sm);
    color: var(--ink-4);
  }
  .records-item-spark {
    flex-shrink: 0;
    display: flex;
    width: 72px;
  }
</style>
