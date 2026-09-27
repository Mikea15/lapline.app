<!-- ActivityLedger.svelte - Today's "activity ledger" table: date, session
     (sport color bar + name + PR flag), distance, time, a per-sport "rate"
     column, avg HR, and a horizontal zone-split mini bar. Rows navigate to the
     Activity screen for that specific activity. -->
<script lang="ts">
  import { sportColorVar, sportFamily, sportFamilyLabel, formatSport } from '../lib/sport-color';
  import { ZONE_COLORS, ZONE_NAMES, zoneIndexForHr } from '../lib/hr-zones';
  import { formatDistance, formatPace, formatSpeed, type UnitSystem } from '../lib/units';
  import { formatDateDMY, formatClock } from '../lib/date-utils';
  import { rateSortValue, type ActivitySortKey } from '../lib/activity-rate';
  import type { Activity } from '../lib/types';
  import { phone } from '../lib/viewport.svelte';

  interface Props {
    activities: Activity[];
    unitSystem: UnitSystem;
    prIds: Set<number>;
    onSelect: (id: number) => void;
    /** Sort state is owned by the caller (ActivityScreen) - this component
        only renders the clickable headers and reports clicks back up.
        Optional: Today's fixed "most recent 15" ledger passes none of
        these and gets plain, non-clickable headers instead - sorting a
        deliberately-fixed newest-first snapshot would be misleading. */
    sortKey?: ActivitySortKey;
    sortDir?: 'asc' | 'desc';
    onSort?: (key: ActivitySortKey) => void;
  }

  let { activities, unitSystem, prIds, onSelect, sortKey, sortDir, onSort }: Props = $props();

  function formatDistanceCell(a: Activity): string {
    const family = sportFamily(a.sport);
    if (family === 'cardio') return '— sets';
    if (a.distanceKm <= 0) return '—';
    if (family === 'pool-swim') return `${Math.round(a.distanceKm * 1000)} m`;
    return formatDistance(a.distanceKm, unitSystem, 2);
  }

  // Formatting only - the underlying number for each sport's "rate" (and
  // for sorting by it) lives in rateSortValue (lib/activity-rate.ts), kept
  // in one place so the displayed value and the sort order can never drift
  // apart from each other.
  function formatRate(a: Activity): string {
    const family = sportFamily(a.sport);
    const v = rateSortValue(a);
    if (v === null) return '—';
    if (family === 'running') return formatPace(v, unitSystem);
    if (family === 'cycling') return formatSpeed(v, unitSystem);
    if (family === 'pool-swim') {
      const m = Math.floor(v / 60);
      const s = Math.round(v % 60);
      return `${m}:${String(s).padStart(2, '0')} /100m`;
    }
    return `${v} max`;
  }

  // A trailing arrow on whichever column is currently sorted; the other
  // three sortable headers show none, rather than a fixed slot for every
  // header (which would waste width on the "Session"/"Avg HR"/"Zones"
  // columns that were never sortable to begin with).
  function sortArrow(key: ActivitySortKey): string {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  // A row's zone split as flex-weighted horizontal segments (same visual
  // language as the Today screen's "weekly time in zone" bar) - reads at a
  // glance as a proportion, unlike the previous 5 individual vertical bars
  // which all floored to a near-identical height at this size and were
  // impossible to compare by eye.
  function zoneSegments(a: Activity): { zone: number; color: string; percent: number }[] {
    if (a.timeInZoneSec.length !== 5) return [];
    const total = a.timeInZoneSec.reduce((s, v) => s + v, 0);
    if (total <= 0) return [];
    return a.timeInZoneSec
      .map((sec, i) => ({ zone: i + 1, color: ZONE_COLORS[i]!, percent: (sec / total) * 100 }))
      .filter((seg) => seg.percent > 0);
  }

  function zoneTitle(a: Activity): string {
    return zoneSegments(a)
      .map((seg) => `Z${seg.zone} ${Math.round(seg.percent)}%`)
      .join(' · ');
  }

  // Colors the single Avg HR reading by its real zone, so a fast scan down
  // the column flags the genuinely hard efforts (Z4 Threshold and Z5
  // Maximum) at a glance. Z1-Z3 (and below-Z1) stay the plain ink color
  // rather than coloring every row - per your own steer, those lower zones
  // aren't the ones worth calling out this way.
  function avgHrZoneIndex(a: Activity): number {
    if (a.avgHR <= 0) return -1;
    const zone = zoneIndexForHr(a.avgHR, a.hrZoneBoundaries);
    return zone >= 3 ? zone : -1;
  }

  const SORT_OPTIONS: { key: ActivitySortKey; label: string }[] = [
    { key: 'date', label: 'Date' },
    { key: 'distance', label: 'Distance' },
    { key: 'time', label: 'Time' },
    { key: 'pace', label: 'Pace' }
  ];
</script>

{#snippet zoneBar(a: Activity)}
  {#if zoneSegments(a).length > 0}
    <div class="zone-mini" title={zoneTitle(a)}>
      {#each zoneSegments(a) as seg (seg.zone)}
        <div class="zone-mini-segment" style="flex: {seg.percent} 0 0; background: {seg.color};"></div>
      {/each}
    </div>
  {/if}
{/snippet}

{#if phone.current}
  <!-- Phone: seven columns can't fit ~360px without scrolling sideways, so
       each session is a stacked row instead - name and distance on top,
       date/time/pace/HR underneath, the zone split as a thin bar below. -->
  {#if onSort}
    <div class="ledger-sort" role="group" aria-label="Sort by">
      <span class="ledger-sort-label">Sort</span>
      {#each SORT_OPTIONS as o (o.key)}
        <button type="button" class:active={sortKey === o.key} aria-pressed={sortKey === o.key} onclick={() => onSort(o.key)}>{o.label}{sortArrow(o.key)}</button>
      {/each}
    </div>
  {/if}
  <ul class="ledger-list">
    {#each activities as a (a.id)}
      {@const zone = avgHrZoneIndex(a)}
      {@const rate = formatRate(a)}
      <li>
        <button type="button" class="ledger-item" onclick={() => onSelect(a.id)} aria-label="Open {formatSport(a.sport)} on {a.date}">
          <span class="sport-bar ledger-item-bar" style="background: {sportColorVar(a.sport)};"></span>
          <span class="ledger-item-top">
            <span class="session-name">{formatSport(a.sport)}</span>
            {#if prIds.has(a.id)}<span class="pr-flag">PR</span>{/if}
            <span class="ledger-item-distance mono">{formatDistanceCell(a)}</span>
          </span>
          <span class="ledger-item-meta mono">
            <span>{formatDateDMY(a.date)}</span>
            <span>{formatClock(a.durationMin * 60)}</span>
            {#if rate !== '—'}<span>{rate}</span>{/if}
            {#if a.avgHR > 0}<span style={zone >= 0 ? `color: ${ZONE_COLORS[zone]};` : ''}>{a.avgHR} bpm</span>{/if}
          </span>
          {#if a.locationLabel}<span class="ledger-item-location">{a.locationLabel}</span>{/if}
          {@render zoneBar(a)}
        </button>
      </li>
    {/each}
  </ul>
{:else}
<div class="table-wrap">
  <table style="min-width: 620px;">
    <thead>
      <tr>
        <th>
          {#if onSort}
            <button type="button" class="th-sort-btn" class:active={sortKey === 'date'} onclick={() => onSort('date')}>Date{sortArrow('date')}</button>
          {:else}
            Date
          {/if}
        </th>
        <th style="text-align: left;">Session</th>
        <th>
          {#if onSort}
            <button type="button" class="th-sort-btn" class:active={sortKey === 'distance'} onclick={() => onSort('distance')}
              >Distance{sortArrow('distance')}</button
            >
          {:else}
            Distance
          {/if}
        </th>
        <th>
          {#if onSort}
            <button type="button" class="th-sort-btn" class:active={sortKey === 'time'} onclick={() => onSort('time')}>Time{sortArrow('time')}</button>
          {:else}
            Time
          {/if}
        </th>
        <th>
          {#if onSort}
            <button type="button" class="th-sort-btn" class:active={sortKey === 'pace'} onclick={() => onSort('pace')}>Pace{sortArrow('pace')}</button>
          {:else}
            Pace
          {/if}
        </th>
        <th>Avg HR</th>
        <th style="text-align: left;">HR Zones</th>
      </tr>
    </thead>
    <tbody>
      {#each activities as a (a.id)}
        <tr
          class="clickable-row"
          onclick={() => onSelect(a.id)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(a.id))}
          role="button"
          tabindex="0"
          aria-label="Open {formatSport(a.sport)} on {a.date}"
        >
          <td style="text-align: left; color: var(--ink-4);">{formatDateDMY(a.date)}</td>
          <td style="text-align: left;">
            <div class="session-cell">
              <span class="sport-bar" style="background: {sportColorVar(a.sport)};"></span>
              <span class="session-name">{formatSport(a.sport)}</span>
              {#if a.locationLabel}
                <span class="location-tag">· {a.locationLabel}</span>
              {/if}
              <span class="sport-tag">{sportFamilyLabel(a.sport).toUpperCase()}</span>
              {#if prIds.has(a.id)}
                <span class="pr-flag">PR</span>
              {/if}
            </div>
          </td>
          <td>{formatDistanceCell(a)}</td>
          <td>{formatClock(a.durationMin * 60)}</td>
          <td>{formatRate(a)}</td>
          <td>
            {#if a.avgHR > 0}
              {@const zone = avgHrZoneIndex(a)}
              <span style={zone >= 0 ? `color: ${ZONE_COLORS[zone]};` : ''}>{a.avgHR} bpm</span>
              {#if zone >= 0}<span class="sr-only"> · Zone {zone + 1} {ZONE_NAMES[zone]}</span>{/if}
            {:else}
              —
            {/if}
          </td>
          <td style="text-align: left;">
            {@render zoneBar(a)}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
{/if}

<style>
  /* th's own font/color/letter-spacing/text-transform (see global.css) is
     inherited by this button rather than repeated here, so a sorted header
     looks identical to a plain one apart from color and the arrow. */
  .th-sort-btn {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    text-transform: inherit;
    letter-spacing: inherit;
    cursor: pointer;
  }
  .th-sort-btn:hover {
    color: var(--ink-3);
  }
  .th-sort-btn.active {
    color: var(--accent);
  }
  .session-cell {
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
  .session-name {
    font-family: var(--font-sans);
    font-weight: var(--fw-medium);
    font-size: var(--fs-base);
    color: var(--ink-1);
    white-space: nowrap;
  }
  .location-tag {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--ink-4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
  }
  .sport-tag {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--ink-6);
    white-space: nowrap;
  }
  .pr-flag {
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-wide);
    color: var(--accent);
  }
  .zone-mini {
    display: flex;
    width: 100%;
    height: 10px;
    border-radius: 2px;
    overflow: hidden;
  }
  .zone-mini-segment {
    min-width: 0;
  }

  .ledger-sort {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .ledger-sort-label {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-6);
    margin-right: var(--space-3);
  }
  .ledger-sort button {
    min-height: 32px;
    padding: var(--space-2) var(--space-5);
    border: 1px solid var(--line-panel);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--ink-4);
  }
  .ledger-sort button.active {
    border-color: var(--accent);
    color: var(--accent);
  }
  .ledger-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .ledger-list li + li {
    border-top: 1px solid var(--line-row);
  }
  .ledger-item {
    display: grid;
    grid-template-columns: 2px minmax(0, 1fr);
    column-gap: var(--space-5);
    row-gap: var(--space-2);
    width: 100%;
    padding: var(--space-5) 0;
    border: none;
    border-radius: 0;
    text-align: left;
  }
  .ledger-item:active {
    background: var(--bg-row-hover);
  }
  .ledger-item > :not(.ledger-item-bar) {
    grid-column: 2;
    min-width: 0;
  }
  .ledger-item-bar {
    grid-row: 1 / span 2;
    height: auto;
  }
  .ledger-item-top {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
  }
  .ledger-item-top .session-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ledger-item-distance {
    margin-left: auto;
    flex-shrink: 0;
    font-size: var(--fs-md);
    color: var(--ink-1);
  }
  .ledger-item-meta {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--space-5);
    font-size: var(--fs-sm);
    color: var(--ink-4);
  }
  .ledger-item-location {
    font-size: var(--fs-sm);
    color: var(--ink-5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ledger-item .zone-mini {
    height: 4px;
    margin-top: var(--space-2);
  }
</style>
