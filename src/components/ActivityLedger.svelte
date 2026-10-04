<!-- ActivityLedger.svelte - Today's "activity ledger" table: date, session
     (sport color bar + name + PR flag), distance, time, a per-sport "rate"
     column, avg HR, and a horizontal zone-split mini bar. Rows navigate to the
     Activity screen for that specific activity. -->
<script module lang="ts">
  // Measured row height per layout, kept across mounts (see windowed rendering below).
  const ledgerRowH: Record<string, number> = {};
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { sportColorVar, sportFamily, sportFamilyLabel, formatSport } from '../lib/sport-color';
  import { formatDistance, formatPoolDistance, formatPace, formatSpeed, type UnitSystem } from '../lib/units';
  import { ZONE_COLORS, ZONE_INK, ZONE_NAMES, zoneIndexForHr } from '../lib/hr-zones';
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
    /** Window the rows (render only those near the viewport) so a history of
        thousands of activities opens instantly. Off for Today's short list. */
    virtual?: boolean;
  }

  let { activities, unitSystem, prIds, onSelect, sortKey, sortDir, onSort, virtual = false }: Props = $props();

  function formatDistanceCell(a: Activity): string {
    const family = sportFamily(a.sport);
    if (family === 'cardio') return '— sets';
    if (a.distanceKm <= 0) return '—';
    if (family === 'pool-swim') return formatPoolDistance(a.distanceKm);
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
  function sortAria(key: ActivitySortKey): 'ascending' | 'descending' | 'none' | undefined {
    if (!onSort) return undefined;
    if (sortKey !== key) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  }

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

  // The stacked layout is chosen by the ledger's own width (Today's ledger
  // sits in a half-width column on laptops), not just the phone viewport.
  // 0 until first measured - then the table is the default on desktop.
  const STACK_BELOW = 560;
  let hostWidth = $state(0);
  const stacked = $derived(phone.current || (hostWidth > 0 && hostWidth < STACK_BELOW));

  // ---- Windowed rendering (virtual) ----
  // Every row of a layout has the same height (single-line cells; the
  // stacked rows reserve their optional lines), so the window is plain
  // arithmetic: rowH is measured from the first rendered row, rows outside
  // the viewport are replaced by spacer height, and the page's own scroll
  // is used (no inner scroller). rowH is remembered per layout across
  // mounts so returning from an activity restores the scroll position
  // straight away instead of waiting for a measurement.
  const OVERSCAN = 10;
  const FIRST_PAINT_ROWS = 30;
  const layoutKey = $derived(stacked ? 'stacked' : 'table');
  let rowH = $state(0);
  let bodyEl: HTMLElement | undefined = $state();
  // The rows' top edge relative to the viewport, and the viewport height.
  let viewTop = $state(0);
  let viewH = $state(typeof window === 'undefined' ? 800 : window.innerHeight);

  $effect(() => {
    rowH = ledgerRowH[layoutKey] ?? 0;
  });

  const windowRange = $derived.by(() => {
    const n = activities.length;
    if (!virtual) return { start: 0, end: n };
    if (rowH <= 0) return { start: 0, end: Math.min(n, FIRST_PAINT_ROWS) };
    const start = Math.min(n, Math.max(0, Math.floor(-viewTop / rowH) - OVERSCAN));
    const end = Math.min(n, Math.max(start, Math.ceil((-viewTop + viewH) / rowH) + OVERSCAN));
    return { start, end };
  });
  const visible = $derived(activities.slice(windowRange.start, windowRange.end));
  const padTop = $derived(windowRange.start * rowH);
  const padBottom = $derived((activities.length - windowRange.end) * rowH);

  function syncView() {
    if (!bodyEl) return;
    viewTop = bodyEl.getBoundingClientRect().top;
    viewH = window.innerHeight;
  }

  $effect(() => {
    if (!virtual) return;
    let frame = 0;
    const onMove = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        syncView();
      });
    };
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    syncView();
    return () => {
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  });

  // A filter or sort changes the list (and the page height) under a fixed
  // scroll position; re-read where the rows now sit once the DOM is updated.
  $effect(() => {
    void activities;
    void layoutKey;
    if (virtual) void tick().then(syncView);
  });

  // Measure the first rendered row (and track it), keeping the window right
  // if the row height changes - a different text size, a layout switch.
  $effect(() => {
    if (!virtual || !bodyEl) return;
    void windowRange;
    const first = bodyEl.querySelector<HTMLElement>('[data-row]');
    if (!first) return;
    const key = layoutKey;
    const measure = () => {
      const h = first.getBoundingClientRect().height;
      if (h > 0 && Math.abs(h - rowH) > 0.25) {
        rowH = h;
        ledgerRowH[key] = h;
        syncView();
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(first);
    return () => ro.disconnect();
  });

  const SORT_OPTIONS: { key: ActivitySortKey; label: string }[] = [
    { key: 'date', label: 'Date' },
    { key: 'distance', label: 'Distance' },
    { key: 'time', label: 'Time' },
    { key: 'pace', label: 'Pace' }
  ];
</script>

{#snippet zoneBar(a: Activity, reserve: boolean = false)}
  {#if zoneSegments(a).length > 0}
    <div class="zone-mini" title={zoneTitle(a)}>
      {#each zoneSegments(a) as seg (seg.zone)}
        <div class="zone-mini-segment" style="flex: {seg.percent} 0 0; background: {seg.color};"></div>
      {/each}
    </div>
  {:else if reserve}
    <div class="zone-mini" aria-hidden="true"></div>
  {/if}
{/snippet}

<div class="ledger-host" bind:clientWidth={hostWidth}>
{#if stacked}
  <!-- Phone or a narrow panel: seven columns can't fit without scrolling sideways, so
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
  <ul class="ledger-list" class:virtual bind:this={bodyEl} style={virtual ? `padding-top: ${padTop}px; padding-bottom: ${padBottom}px;` : undefined}>
    {#each visible as a, i (a.id)}
      {@const zone = avgHrZoneIndex(a)}
      {@const rate = formatRate(a)}
      <li data-row aria-posinset={virtual ? windowRange.start + i + 1 : undefined} aria-setsize={virtual ? activities.length : undefined}>
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
            {#if a.avgHR > 0}<span style={zone >= 0 ? `color: ${ZONE_INK[zone]};` : ''}>{a.avgHR} bpm</span>{/if}
          </span>
          {#if a.locationLabel}<span class="ledger-item-location">{a.locationLabel}</span>{:else if virtual}<span class="ledger-item-location" aria-hidden="true">&nbsp;</span>{/if}
          {@render zoneBar(a, virtual)}
        </button>
      </li>
    {/each}
  </ul>
{:else}
<div class="table-wrap">
  <table class="ledger-table" aria-rowcount={virtual ? activities.length + 1 : undefined}>
    <caption class="sr-only">Activities, {activities.length} shown{sortKey ? `, sorted by ${sortKey} ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}</caption>
    <colgroup>
      <col class="c-date" />
      <col class="c-session" />
      <col class="c-dist" />
      <col class="c-time" />
      <col class="c-pace" />
      <col class="c-hr" />
      <col class="c-zones" />
    </colgroup>
    <thead>
      <tr aria-rowindex={virtual ? 1 : undefined}>
        <th scope="col" aria-sort={sortAria('date')}>
          {#if onSort}
            <button type="button" class="th-sort-btn" class:active={sortKey === 'date'} onclick={() => onSort('date')}>Date<span aria-hidden="true">{sortArrow('date')}</span></button>
          {:else}
            Date
          {/if}
        </th>
        <th scope="col" style="text-align: left;">Session</th>
        <th scope="col" aria-sort={sortAria('distance')}>
          {#if onSort}
            <button type="button" class="th-sort-btn" class:active={sortKey === 'distance'} onclick={() => onSort('distance')}
              >Distance<span aria-hidden="true">{sortArrow('distance')}</span></button
            >
          {:else}
            Distance
          {/if}
        </th>
        <th scope="col" aria-sort={sortAria('time')}>
          {#if onSort}
            <button type="button" class="th-sort-btn" class:active={sortKey === 'time'} onclick={() => onSort('time')}>Time<span aria-hidden="true">{sortArrow('time')}</span></button>
          {:else}
            Time
          {/if}
        </th>
        <th scope="col" aria-sort={sortAria('pace')}>
          {#if onSort}
            <button type="button" class="th-sort-btn" class:active={sortKey === 'pace'} onclick={() => onSort('pace')}>Pace<span aria-hidden="true">{sortArrow('pace')}</span></button>
          {:else}
            Pace
          {/if}
        </th>
        <th scope="col" class="c-hr">Avg HR</th>
        <th scope="col" class="c-zones" style="text-align: left;">HR Zones</th>
      </tr>
    </thead>
    <tbody bind:this={bodyEl}>
      {#if virtual && padTop > 0}
        <tr class="ledger-spacer" aria-hidden="true" style="height: {padTop}px;"><td colspan="7"></td></tr>
      {/if}
      {#each visible as a, i (a.id)}
        <tr
          class="clickable-row"
          data-row
          aria-rowindex={virtual ? windowRange.start + i + 2 : undefined}
          onclick={() => onSelect(a.id)}
        >
          <td style="text-align: left; color: var(--ink-4);">{formatDateDMY(a.date)}</td>
          <td style="text-align: left;">
            <div class="session-cell" title={a.locationLabel ? `${formatSport(a.sport)} · ${a.locationLabel}` : formatSport(a.sport)}>
              <span class="sport-bar" style="background: {sportColorVar(a.sport)};"></span>
              <button type="button" class="row-link session-name" aria-label="Open {formatSport(a.sport)} on {a.date}">{formatSport(a.sport)}</button>
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
          <td class="c-hr">
            {#if a.avgHR > 0}
              {@const zone = avgHrZoneIndex(a)}
              <span style={zone >= 0 ? `color: ${ZONE_INK[zone]};` : ''}>{a.avgHR} bpm</span>
              {#if zone >= 0}<span class="sr-only"> · Zone {zone + 1} {ZONE_NAMES[zone]}</span>{/if}
            {:else}
              —
            {/if}
          </td>
          <td class="c-zones" style="text-align: left;">
            {@render zoneBar(a)}
          </td>
        </tr>
      {/each}
      {#if virtual && padBottom > 0}
        <tr class="ledger-spacer" aria-hidden="true" style="height: {padBottom}px;"><td colspan="7"></td></tr>
      {/if}
    </tbody>
  </table>
</div>
{/if}
</div>

<style>
  /* th's own font/color/letter-spacing/text-transform (see global.css) is
     inherited by this button rather than repeated here, so a sorted header
     looks identical to a plain one apart from color and the arrow. */
  /* The row's keyboard/screen-reader entry point; the whole row's click
     (mouse) bubbles from it to the <tr>. */
  .row-link {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row-link:focus-visible {
    outline: none;
  }
  tr.clickable-row:focus-within {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }
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
    color: var(--accent-ink);
  }
  .session-cell {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    min-width: 0;
  }
  /* Fixed layout: the Session column takes whatever the fixed numeric
     columns leave, and its text truncates with an ellipsis, so the table
     always fits its container instead of scrolling sideways. Lower-priority
     columns drop out as the container (not the viewport) narrows. */
  .ledger-host {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .ledger-host :global(.table-wrap) {
    overflow-x: hidden;
  }
  .ledger-table {
    table-layout: fixed;
  }
  .ledger-table :global(tr.ledger-spacer td) {
    padding: 0;
    border: none;
    background: none;
  }
  .c-date { width: 96px; }
  .c-dist { width: 96px; }
  .c-time { width: 84px; }
  .c-pace { width: 116px; }
  .c-hr { width: 92px; }
  .c-zones { width: 150px; }
  .ledger-table td {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @container (max-width: 859px) {
    .sport-tag {
      display: none;
    }
    .c-zones {
      display: none;
    }
  }
  @container (max-width: 639px) {
    .location-tag,
    .c-hr {
      display: none;
    }
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
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
  }
  .location-tag {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--ink-4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
    flex-shrink: 2;
    min-width: 0;
  }
  .sport-tag {
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--ink-5);
    white-space: nowrap;
  }
  .pr-flag {
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-wide);
    color: var(--accent-ink);
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
    color: var(--ink-5);
    margin-right: var(--space-3);
  }
  .ledger-sort button {
    min-height: 44px;
    padding: var(--space-2) var(--space-5);
    border: 1px solid var(--line-panel);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--ink-4);
  }
  .ledger-sort button.active {
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  .ledger-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .ledger-list li + li {
    border-top: 1px solid var(--line-row);
  }
  /* Windowed list: every li closes itself (the window's first li has no
     predecessor to draw a divider), and the meta wrap is clipped so all
     rows stay one height. */
  .ledger-list.virtual li + li {
    border-top: none;
  }
  .ledger-list.virtual li {
    border-bottom: 1px solid var(--line-row);
  }
  .ledger-list.virtual .ledger-item-meta {
    flex-wrap: nowrap;
    overflow: hidden;
    white-space: nowrap;
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
