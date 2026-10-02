<!-- CalendarScreen.svelte - Calendar (design_handoff_calendar/README.md): a
     month-grid view of real recorded sessions, day by day, with a week
     rollup column and a month stat strip.

     The design brief's "planned/prescribed session" half - dashed planned
     chips, adherence %, the plan-vs-actual chart, the "Next seven days"
     prescription queue and the 18-week periodization block - is dropped
     entirely rather than faked. This app has no training-plan data source
     (only imported workout .fit files), the same reason the sidebar's old
     Goal Race card was removed rather than sourced (see next-steps.md).
     Everything below reads the same real `activities` table every other
     screen does; there is nothing "planned" or "prescribed" left to show. -->
<script lang="ts">
  import CalendarKpis from '../kpi/CalendarKpis.svelte';
  import { activitiesStore, settingsStore } from '../../lib/stores.svelte';
  import { monthGridWeeks, isInMonth } from '../../lib/calendar-grid';
  import { activityLoad } from '../../lib/training-load';
  import { sportColorVar, sportFamily, familyColorVar, familyLabel, formatSport, type SportFamily } from '../../lib/sport-color';
  import { ZONE_COLORS } from '../../lib/hr-zones';
  import { formatDistance, toDisplayDistance, distanceUnit } from '../../lib/units';
  import { formatClock, todayStr } from '../../lib/date-utils';
  import Icon from '../Icon.svelte';
  import InfoLabel from '../InfoLabel.svelte';
  import type { Activity } from '../../lib/types';

  interface Props {
    onSelectActivity: (id: number) => void;
  }

  let { onSelectActivity }: Props = $props();

  let activities = $derived(activitiesStore.all);
  let unitSystem = $derived(settingsStore.getUnitSystem());
  let today = todayStr();

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAY_HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // Fixed display order for the legend - only families actually present in
  // the visible grid are shown, but always in this order when they appear.
  const FAMILY_ORDER: SportFamily[] = ['running', 'cycling', 'pool-swim', 'cardio', 'climbing', 'other'];

  function pad2(n: number): string {
    return String(n).padStart(2, '0');
  }

  const now = new Date();
  let viewYear = $state(now.getFullYear());
  let viewMonth = $state(now.getMonth() + 1); // 1-indexed

  function prevMonth() {
    if (viewMonth === 1) {
      viewMonth = 12;
      viewYear -= 1;
    } else {
      viewMonth -= 1;
    }
  }
  function nextMonth() {
    if (viewMonth === 12) {
      viewMonth = 1;
      viewYear += 1;
    } else {
      viewMonth += 1;
    }
  }
  function jumpToday() {
    const t = new Date();
    viewYear = t.getFullYear();
    viewMonth = t.getMonth() + 1;
  }

  let isCurrentMonth = $derived(`${viewYear}-${pad2(viewMonth)}` === today.slice(0, 7));
  let monthLabel = $derived(`${MONTH_NAMES[viewMonth - 1]} ${viewYear}`);

  // ===== Quick year/month picker (click the "MONTH YEAR" label) =====

  let showMonthPicker = $state(false);
  // Seeded from `now`, not `viewYear` - reset to the real viewYear every time
  // the picker opens (toggleMonthPicker), so this only needs *a* starting
  // value, not a live binding to it.
  let pickerYear = $state(now.getFullYear());
  let monthTriggerEl = $state<HTMLButtonElement | null>(null);
  let monthPickerEl = $state<HTMLDivElement | null>(null);
  const todayYear = Number(today.slice(0, 4));
  const todayMonth = Number(today.slice(5, 7));

  function toggleMonthPicker() {
    if (showMonthPicker) {
      showMonthPicker = false;
      return;
    }
    pickerYear = viewYear;
    showMonthPicker = true;
  }
  function selectMonth(m: number) {
    viewYear = pickerYear;
    viewMonth = m;
    showMonthPicker = false;
  }
  function handleWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && showMonthPicker) showMonthPicker = false;
  }
  $effect(() => {
    if (!showMonthPicker) return;
    function onDocMousedown(e: MouseEvent) {
      const target = e.target as Node;
      if (monthPickerEl?.contains(target) || monthTriggerEl?.contains(target)) return;
      showMonthPicker = false;
    }
    document.addEventListener('mousedown', onDocMousedown);
    return () => document.removeEventListener('mousedown', onDocMousedown);
  });

  let weeks = $derived(monthGridWeeks(viewYear, viewMonth));

  let activitiesByDate = $derived.by(() => {
    const m = new Map<string, Activity[]>();
    for (const a of activities) {
      const list = m.get(a.date);
      if (list) list.push(a);
      else m.set(a.date, [a]);
    }
    return m;
  });

  // [time, distance?] - rendered as separate spans so a narrow day column
  // wraps the distance onto its own line rather than truncating it.
  function sessionMeta(a: Activity): string[] {
    const family = sportFamily(a.sport);
    const time = formatClock(a.durationMin * 60);
    if (family === 'cardio' || a.distanceKm <= 0) return [time];
    const dist = family === 'pool-swim' ? `${Math.round(a.distanceKm * 1000)} m` : formatDistance(a.distanceKm, unitSystem, 2);
    return [time, dist];
  }

  interface DayCell {
    date: string;
    dayNum: number;
    inMonth: boolean;
    isToday: boolean;
    isPast: boolean;
    sessionCount: number;
    chips: Activity[];
    overflowCount: number;
    overflowTitle: string;
    loadAu: number;
    zones: { frac: number; color: string }[] | null;
  }

  function buildDay(date: string): DayCell {
    const sessions = activitiesByDate.get(date) ?? [];
    const loadAu = sessions.reduce((s, a) => s + activityLoad(a), 0);

    let zones: { frac: number; color: string }[] | null = null;
    if (sessions.length > 0) {
      const totals = [0, 0, 0, 0, 0];
      let hasZoneData = false;
      for (const a of sessions) {
        if (a.timeInZoneSec.length === 5) {
          hasZoneData = true;
          for (let i = 0; i < 5; i++) totals[i]! += a.timeInZoneSec[i]!;
        }
      }
      const sum = totals.reduce((s, v) => s + v, 0);
      if (hasZoneData && sum > 0) {
        zones = totals.map((v, i) => ({ frac: v / sum, color: ZONE_COLORS[i]! })).filter((z) => z.frac > 0);
      }
    }

    const overflow = sessions.slice(3);

    return {
      date,
      dayNum: Number(date.slice(8, 10)),
      inMonth: isInMonth(date, viewYear, viewMonth),
      isToday: date === today,
      isPast: date < today,
      sessionCount: sessions.length,
      chips: sessions.slice(0, 3),
      overflowCount: overflow.length,
      overflowTitle: overflow.map((a) => formatSport(a.sport)).join(', '),
      loadAu,
      zones
    };
  }

  interface WeekRollup {
    gutterLabel: string;
    hoursLabel: string;
    km: number;
    loadAu: number;
    sessionCount: number;
    avgLabel: string; // average session duration, "H:MM" - "—" with no sessions
    calories: number;
  }

  function buildWeekRollup(days: string[]): WeekRollup {
    let minutes = 0;
    let km = 0;
    let loadAu = 0;
    let sessionCount = 0;
    let calories = 0;
    for (const date of days) {
      for (const a of activitiesByDate.get(date) ?? []) {
        minutes += a.durationMin;
        km += a.distanceKm;
        loadAu += activityLoad(a);
        calories += a.calories;
        sessionCount++;
      }
    }
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    const avgMinutes = sessionCount > 0 ? minutes / sessionCount : 0;
    const avgLabel = sessionCount > 0 ? `${Math.floor(avgMinutes / 60)}:${pad2(Math.round(avgMinutes % 60))}` : '—';
    return { gutterLabel: String(Number(days[0]!.slice(8, 10))), hoursLabel: `${h}:${pad2(m)}`, km, loadAu, sessionCount, avgLabel, calories };
  }

  let weekRows = $derived(
    weeks.map((days) => ({
      days,
      dayCells: days.map(buildDay),
      rollup: buildWeekRollup(days)
    }))
  );

  let visibleFamilies = $derived.by(() => {
    const present = new Set<SportFamily>();
    for (const week of weeks) {
      for (const date of week) {
        for (const a of activitiesByDate.get(date) ?? []) present.add(sportFamily(a.sport));
      }
    }
    return FAMILY_ORDER.filter((f) => present.has(f));
  });

  // ===== Interactions =====

  let hoveredWeek = $state<number | null>(null);

  // Bound separately for the grid and the sub-1080px week-list fallback -
  // both render at once (CSS media query picks which is visible), so
  // today-anchoring scrolls whichever one is actually on screen.
  let weekRowEls: (HTMLDivElement | null)[] = [];
  let weekListRowEls: (HTMLDivElement | null)[] = [];
  $effect(() => {
    if (!isCurrentMonth) return;
    const idx = weeks.findIndex((w) => w.includes(today));
    for (const el of [weekRowEls[idx], weekListRowEls[idx]]) {
      if (el && el.offsetParent !== null) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });

  function selectChip(e: MouseEvent | KeyboardEvent, id: number) {
    if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onSelectActivity(id);
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="screen">
  {#if activities.length === 0}
    <div class="panel empty-state">No activities yet. Choose Sync to add your first.</div>
  {:else}
    <CalendarKpis {activities} year={viewYear} month={viewMonth} {today} {weeks} {unitSystem} />

    <section class="panel cal-panel">
      <div class="panel-head cal-panel-head">
        <div class="cal-nav">
          <button class="icon-btn" onclick={prevMonth} aria-label="Previous month">
            <span class="cal-chevron-left"><Icon name="chevron-right" size={13} /></span>
          </button>
          <div class="cal-month-picker-wrap">
            <button
              class="panel-label cal-month-label cal-nav-pill"
              bind:this={monthTriggerEl}
              onclick={toggleMonthPicker}
              aria-haspopup="true"
              aria-expanded={showMonthPicker}
              >{monthLabel.toUpperCase()}</button
            >
            {#if showMonthPicker}
              <div class="cal-month-picker" bind:this={monthPickerEl} role="dialog" aria-label="Jump to month">
                <div class="cal-picker-year-nav">
                  <button class="icon-btn" onclick={() => (pickerYear -= 1)} aria-label="Previous year">
                    <span class="cal-chevron-left"><Icon name="chevron-right" size={11} /></span>
                  </button>
                  <span class="mono cal-picker-year">{pickerYear}</span>
                  <button class="icon-btn" onclick={() => (pickerYear += 1)} aria-label="Next year">
                    <Icon name="chevron-right" size={11} />
                  </button>
                </div>
                <div class="cal-picker-months">
                  {#each MONTH_NAMES as name, i (name)}
                    <button
                      class="cal-picker-month mono"
                      class:active={pickerYear === viewYear && i + 1 === viewMonth}
                      class:current={pickerYear === todayYear && i + 1 === todayMonth}
                      onclick={() => selectMonth(i + 1)}>{name.slice(0, 3)}</button
                    >
                  {/each}
                </div>
              </div>
            {/if}
          </div>
          <button class="icon-btn" onclick={nextMonth} aria-label="Next month">
            <Icon name="chevron-right" size={13} />
          </button>
          {#if !isCurrentMonth}
            <button class="panel-label cal-nav-pill" onclick={jumpToday}>Today</button>
          {/if}
        </div>
        {#if visibleFamilies.length > 0}
          <div class="cal-legend">
            {#each visibleFamilies as fam (fam)}
              <span class="cal-legend-item mono"><span class="cal-legend-swatch" style="background: {familyColorVar(fam)};"></span>{familyLabel(fam)}</span>
            {/each}
          </div>
        {/if}
      </div>

      <div class="cal-grid-wrap">
        <div class="cal-grid-inner">
          <div class="cal-week-row cal-head-row">
            <div></div>
            {#each DAY_HEADS as h (h)}
              <div class="cal-head-cell mono">{h}</div>
            {/each}
            <div class="cal-head-cell cal-head-week mono">Week</div>
          </div>

          {#each weekRows as week, weekIndex (week.days[0])}
            <div class="cal-week-row" bind:this={weekRowEls[weekIndex]}>
              <div class="cal-week-gutter mono">{week.rollup.gutterLabel}</div>
              {#each week.dayCells as cell (cell.date)}
                <div class="cal-day" class:cal-day-today={cell.isToday} class:cal-day-out={!cell.inMonth} class:cal-day-hover={hoveredWeek === weekIndex}>
                  <div class="cal-day-head">
                    <span
                      class="cal-day-num mono"
                      class:accent={cell.isToday}
                      class:out={!cell.inMonth}
                      class:past={cell.inMonth && !cell.isToday && cell.isPast}
                      class:future={cell.inMonth && !cell.isToday && !cell.isPast}>{cell.dayNum}</span
                    >
                    {#if cell.isToday}
                      <span class="cal-day-tag mono accent">TODAY</span>
                    {:else if cell.inMonth && cell.isPast && cell.sessionCount === 0}
                      <span class="cal-day-tag mono">REST</span>
                    {/if}
                    {#if cell.loadAu > 0}
                      <span class="cal-day-load mono">{Math.round(cell.loadAu)} au</span>
                    {/if}
                  </div>

                  {#each cell.chips as a (a.id)}
                    <div
                      class="cal-chip"
                      role="button"
                      tabindex="0"
                      onclick={(e) => selectChip(e, a.id)}
                      onkeydown={(e) => selectChip(e, a.id)}
                      aria-label="Open {formatSport(a.sport)} on {cell.date}"
                    >
                      <span class="cal-chip-bar" style="background: {sportColorVar(a.sport)};"></span>
                      <div class="cal-chip-text">
                        <span class="cal-chip-name">{formatSport(a.sport)}</span>
                        <span class="cal-chip-meta mono">{#each sessionMeta(a) as part, i (i)}<span>{part}</span>{/each}</span>
                      </div>
                    </div>
                  {/each}
                  {#if cell.overflowCount > 0}
                    <div class="cal-chip-more mono" title={cell.overflowTitle}>+{cell.overflowCount} more</div>
                  {/if}

                  {#if cell.zones}
                    <div class="cal-zone-strip">
                      {#each cell.zones as z, i (i)}
                        <span style="flex: {z.frac}; background: {z.color};"></span>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="cal-rollup" role="presentation" onmouseenter={() => (hoveredWeek = weekIndex)} onmouseleave={() => (hoveredWeek = null)}>
                <div class="cal-rollup-hours">
                  <span class="mono">{week.rollup.hoursLabel}</span>
                  <span class="cal-rollup-hours-unit mono">h</span>
                </div>
                <div class="cal-rollup-row mono">
                  <span>{formatDistance(week.rollup.km, unitSystem, 1)}</span>
                  <span>{Math.round(week.rollup.loadAu)} au</span>
                </div>
                <div class="cal-rollup-row mono">
                  <span>{week.rollup.avgLabel} / session</span>
                  <span>{Math.round(week.rollup.calories)} kcal</span>
                </div>
                <div class="cal-rollup-sessions mono">{week.rollup.sessionCount} {week.rollup.sessionCount === 1 ? 'session' : 'sessions'}</div>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="cal-week-list">
        {#each weekRows as week, weekIndex (week.days[0])}
          <div class="cal-wl-week" bind:this={weekListRowEls[weekIndex]}>
            <div class="cal-wl-week-head">
              <span class="cal-wl-week-label mono">Week of {week.rollup.gutterLabel}</span>
              <span class="cal-wl-week-stats mono">{week.rollup.hoursLabel} h · {formatDistance(week.rollup.km, unitSystem, 1)} · {Math.round(week.rollup.loadAu)} au · {week.rollup.sessionCount} {week.rollup.sessionCount === 1 ? 'session' : 'sessions'}</span>
            </div>
            {#each week.dayCells as cell, dayIndex (cell.date)}
              <div class="cal-wl-day" class:cal-wl-day-today={cell.isToday} class:cal-wl-day-out={!cell.inMonth}>
                <div class="cal-wl-day-head">
                  <span class="cal-wl-day-name mono">{DAY_HEADS[dayIndex]}</span>
                  <span
                    class="cal-day-num mono"
                    class:accent={cell.isToday}
                    class:out={!cell.inMonth}
                    class:past={cell.inMonth && !cell.isToday && cell.isPast}
                    class:future={cell.inMonth && !cell.isToday && !cell.isPast}>{cell.dayNum}</span
                  >
                  {#if cell.isToday}
                    <span class="cal-day-tag mono accent">TODAY</span>
                  {:else if cell.inMonth && cell.isPast && cell.sessionCount === 0}
                    <span class="cal-day-tag mono">REST</span>
                  {/if}
                  {#if cell.loadAu > 0}
                    <span class="cal-day-load mono">{Math.round(cell.loadAu)} au</span>
                  {/if}
                </div>

                {#if cell.chips.length > 0 || cell.overflowCount > 0}
                  <div class="cal-wl-sessions">
                    {#each cell.chips as a (a.id)}
                      <div
                        class="cal-chip cal-wl-chip"
                        role="button"
                        tabindex="0"
                        onclick={(e) => selectChip(e, a.id)}
                        onkeydown={(e) => selectChip(e, a.id)}
                        aria-label="Open {formatSport(a.sport)} on {cell.date}"
                      >
                        <span class="cal-chip-bar" style="background: {sportColorVar(a.sport)};"></span>
                        <div class="cal-chip-text">
                          <span class="cal-chip-name">{formatSport(a.sport)}</span>
                          <span class="cal-chip-meta mono">{#each sessionMeta(a) as part, i (i)}<span>{part}</span>{/each}</span>
                        </div>
                      </div>
                    {/each}
                    {#if cell.overflowCount > 0}
                      <div class="cal-chip-more mono" title={cell.overflowTitle}>+{cell.overflowCount} more</div>
                    {/if}
                  </div>
                {/if}

                {#if cell.zones}
                  <div class="cal-zone-strip cal-wl-zone-strip">
                    {#each cell.zones as z, i (i)}
                      <span style="flex: {z.frac}; background: {z.color};"></span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .cal-panel {
    container: cal / inline-size;
    padding: 0;
    overflow: hidden;
  }
  .cal-panel-head {
    padding: var(--space-6) var(--space-7) var(--space-6);
    border-bottom: 1px solid var(--line-soft);
  }
  .cal-nav {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .cal-chevron-left {
    display: inline-flex;
    transform: scaleX(-1);
  }
  .cal-month-picker-wrap {
    position: relative;
  }
  .cal-month-label {
    min-width: 150px;
    text-align: center;
  }
  /* Same persistent-border chrome as the prev/next .icon-btn either side of
     it (height, border, radius, transparent fill, ink-5/hover colors), so
     the whole prev / month / next / Today cluster reads as one control
     instead of assorted buttons with different chrome. Shared by the month
     label trigger and the "Today" jump button. */
  .cal-nav-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 26px;
    padding: 0 var(--space-5);
    border: 1px solid var(--line-panel);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink-5);
  }
  .cal-nav-pill:hover {
    color: var(--ink-1);
    border-color: var(--ink-6);
    background: var(--bg-row-hover);
  }
  .cal-nav-pill:focus-visible {
    outline: none;
    border-color: var(--accent);
    color: var(--ink-1);
  }
  .cal-nav-pill[aria-expanded='true'] {
    color: var(--ink-1);
    border-color: var(--ink-6);
    background: var(--bg-row-hover);
  }

  .cal-month-picker {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 10;
    width: 192px;
    background: var(--bg-panel);
    border: 1px solid var(--line-panel);
    border-radius: var(--radius);
    padding: var(--space-5);
    box-shadow: var(--shadow-pop);
  }
  .cal-picker-year-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-5);
    margin-bottom: var(--space-5);
  }
  .cal-picker-year {
    font-size: var(--fs-sm);
    color: var(--ink-1);
    min-width: 40px;
    text-align: center;
  }
  .cal-picker-months {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }
  .cal-picker-month {
    padding: var(--space-4) 0;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    color: var(--ink-3);
    text-align: center;
  }
  .cal-picker-month:hover {
    background: var(--bg-row-hover);
    color: var(--ink-1);
  }
  .cal-picker-month.current {
    border-color: var(--ink-6);
    color: var(--ink-1);
  }
  .cal-picker-month.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .cal-legend {
    margin-left: auto;
    display: flex;
    gap: var(--space-6);
    flex-wrap: wrap;
  }
  .cal-legend-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--fs-xs);
    color: var(--ink-5);
  }
  .cal-legend-swatch {
    width: 9px;
    height: 9px;
    border-radius: 1px;
  }

  .cal-grid-wrap {
    overflow-x: auto;
  }
  .cal-grid-inner {
    min-width: 860px;
  }
  .cal-week-row {
    display: grid;
    grid-template-columns: 30px repeat(7, minmax(0, 1fr)) 188px;
    border-bottom: 1px solid var(--line-row);
  }
  .cal-head-row {
    border-bottom: 1px solid var(--line-soft);
  }
  .cal-head-cell {
    padding: var(--space-4) var(--space-5);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-6);
  }
  .cal-head-week {
    border-left: 1px solid var(--line-soft);
  }
  .cal-week-gutter {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: var(--space-5) 0;
    font-size: var(--fs-xs);
    color: var(--ink-7);
  }

  .cal-day {
    border-left: 1px solid var(--line-row);
    padding: var(--space-4) var(--space-4) var(--space-4);
    min-height: 112px;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  .cal-day-today {
    background: var(--bg-row-active);
  }
  .cal-day-out {
    background: var(--bg-well);
  }
  .cal-day-hover {
    box-shadow: inset 0 0 0 1px var(--line-panel);
  }
  .cal-day-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .cal-day-num {
    font-size: var(--fs-xs);
    color: var(--ink-2);
  }
  .cal-day-num.accent {
    color: var(--accent);
  }
  .cal-day-num.future {
    color: var(--ink-4);
  }
  .cal-day-num.out {
    color: var(--ink-7);
  }
  .cal-day-tag {
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-7);
  }
  .cal-day-tag.accent {
    color: var(--accent);
  }
  .cal-day-load {
    margin-left: auto;
    font-size: var(--fs-xs);
    color: var(--ink-7);
  }

  .cal-chip {
    display: flex;
    align-items: stretch;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--bg-row-hover);
    border: 1px solid var(--line-chip);
    min-width: 0;
    cursor: pointer;
  }
  .cal-chip:hover {
    border-color: var(--ink-6);
  }
  .cal-chip:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: 1px;
  }
  .cal-chip-bar {
    width: 2px;
    flex: none;
    border-radius: 1px;
  }
  .cal-chip-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .cal-chip-name {
    font-family: var(--font-sans);
    font-weight: var(--fw-medium);
    font-size: var(--fs-xs);
    line-height: 1.1;
    color: var(--ink-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cal-chip-meta {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--space-3);
    font-size: var(--fs-xs);
    color: var(--ink-4);
    white-space: nowrap;
  }
  .cal-chip-more {
    font-size: var(--fs-xs);
    color: var(--ink-6);
  }

  .cal-zone-strip {
    margin-top: auto;
    display: flex;
    gap: 1px;
    height: 3px;
  }

  .cal-rollup {
    border-left: 1px solid var(--line-soft);
    padding: var(--space-4) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .cal-rollup-hours {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
  }
  .cal-rollup-hours span:first-child {
    font-size: var(--fs-base);
    color: var(--ink-1);
  }
  .cal-rollup-hours-unit {
    font-size: var(--fs-xs);
    color: var(--ink-6);
  }
  .cal-rollup-row {
    display: flex;
    gap: var(--space-4);
    white-space: nowrap;
    justify-content: space-between;
    font-size: var(--fs-xs);
    color: var(--ink-7);
  }
  .cal-rollup-sessions {
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    color: var(--ink-6);
  }

  /* Below ~1080px the 7-column grid's day columns drop under ~110px and
     become unreadable (design_handoff_calendar/README.md §10) - swap to a
     one-row-per-day list instead of just shrinking the grid further. Both
     layouts render at once; the media query picks which is visible, same
     approach as the rest of this app's responsive passes. */
  .cal-week-list {
    display: none;
  }
  /* Switch on the panel's own width, not the window's - the sidebar takes
     ~230px, so a 1200px window used to get a grid too wide for its panel. */
  @container cal (max-width: 899px) {
    .cal-grid-wrap {
      display: none;
    }
    .cal-week-list {
      display: block;
    }
  }

  .cal-wl-week + .cal-wl-week {
    border-top: 1px solid var(--line-soft);
  }
  .cal-wl-week-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-5);
    padding: var(--space-5) var(--space-7);
    background: var(--bg-well);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-6);
  }
  .cal-wl-week-label {
    flex: none;
    white-space: nowrap;
  }
  .cal-wl-week-stats {
    text-align: right;
    text-transform: none;
    letter-spacing: normal;
    color: var(--ink-5);
  }
  .cal-wl-day {
    padding: var(--space-4) var(--space-7);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    border-top: 1px solid var(--line-row);
  }
  .cal-wl-day-today {
    background: var(--bg-row-active);
  }
  .cal-wl-day-out {
    background: var(--bg-well);
  }
  .cal-wl-day-head {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .cal-wl-day-name {
    width: 30px;
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-6);
  }
  .cal-wl-sessions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }
  .cal-wl-chip {
    flex: 1 1 200px;
    max-width: 320px;
  }
  .cal-wl-zone-strip {
    margin-top: 0;
  }

  @media (max-width: 480px) {
    .cal-wl-chip {
      flex-basis: 100%;
      max-width: none;
    }
  }
</style>
