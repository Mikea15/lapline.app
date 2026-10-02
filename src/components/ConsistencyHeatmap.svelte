<!-- ConsistencyHeatmap.svelte - Today's Consistency panel: a rolling-year
     (52-week) x 7-day calendar where each day's colour is its main sport
     and the shade is how many minutes were trained (lib/consistency.ts),
     with how often each weekday gets trained down the side, active days / adherence /
     streaks across the top and a sport legend underneath.
     Months are split apart (bug-list.md): a week that straddles two months
     becomes two partial columns, one per month, so each month is its own
     block with a gap before it and its short name centred above it.
     Each day cell has a proper hover tooltip (its full date, sport and
     minutes) rather than relying on the browser's native title attribute,
     which showed no date at all and is slow, unstyled, and easy to miss. -->
<script lang="ts">
  import { touchHover } from '../lib/touch-hover';
  import type { Activity } from '../lib/types';
  import { formatDateLong, dateToStr, addDays } from '../lib/date-utils';
  import { phone } from '../lib/viewport.svelte';
  import { familyColorVar, familyShortLabel, type SportFamily } from '../lib/sport-color';
  import { daySummaries, depthLevel, longestStreak, weekdayShare, DEPTH_LIMITS } from '../lib/consistency';
  import InfoLabel from './InfoLabel.svelte';

  interface Props {
    activities: Activity[];
    weeks?: number;
  }

  let { activities, weeks = 52 }: Props = $props();

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  // How much of the sport's colour each shade step mixes in.
  const DEPTH_MIX = [0, 34, 55, 77, 100];

  function startOfWeekMonday(d: Date): Date {
    const day = (d.getDay() + 6) % 7; // 0 = Monday
    const s = new Date(d);
    s.setHours(0, 0, 0, 0);
    s.setDate(s.getDate() - day);
    return s;
  }

  let days = $derived(daySummaries(activities));

  function shade(family: SportFamily, minutes: number): string {
    const mix = DEPTH_MIX[depthLevel(minutes)]!;
    return `color-mix(in srgb, ${familyColorVar(family)} ${mix}%, var(--bg-well))`;
  }

  interface Cell {
    date: string;
    pad: boolean; // the other month's half of a split week - drawn empty
    minutes: number;
    family: SportFamily | null;
    isFuture: boolean;
    isRest: boolean;
    isToday: boolean;
    color: string;
  }

  interface Column {
    cells: Cell[];
  }

  let today = $derived.by(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });
  let todayStr = $derived(dateToStr(today));
  let firstMonday = $derived.by(() => {
    const m = startOfWeekMonday(today);
    m.setDate(m.getDate() - (weeks - 1) * 7);
    return dateToStr(m);
  });

  interface Month {
    label: string | null; // null when the month is too narrow to label
    columns: Column[];
  }

  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // A month needs this many columns before its name fits above it, so the
  // window's leading sliver of a month doesn't collide with the next label.
  const MIN_LABEL_COLUMNS = 3;

  let months = $derived.by(() => {
    const thisWeekMonday = startOfWeekMonday(today);
    const cols: (Column & { month: number })[] = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const weekStart = new Date(thisWeekMonday);
      weekStart.setDate(weekStart.getDate() - w * 7);
      const weekDays: (Cell & { month: number })[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + d);
        const dateStr = dateToStr(date);
        const isFuture = date > today;
        const day = days.get(dateStr);
        const minutes = day?.minutes ?? 0;
        weekDays.push({
          date: dateStr,
          pad: false,
          minutes,
          family: day?.family ?? null,
          isFuture,
          isRest: !isFuture && minutes <= 0,
          isToday: dateStr === todayStr,
          color: day ? shade(day.family, minutes) : '',
          month: date.getMonth()
        });
      }
      // One column per month this week touches (at most two), with the
      // other month's days as empty pads so rows stay aligned to weekdays.
      const monthsInWeek = [...new Set(weekDays.map((c) => c.month))];
      for (const month of monthsInWeek) {
        const cells = weekDays.map((c) => (c.month === month ? c : { ...c, pad: true }));
        cols.push({ cells, month });
      }
    }
    const out: (Month & { month: number })[] = [];
    for (const col of cols) {
      const last = out[out.length - 1];
      if (last && last.month === col.month) last.columns.push(col);
      else out.push({ month: col.month, label: MONTH_LABELS[col.month]!, columns: [col] });
    }
    for (const m of out) if (m.columns.length < MIN_LABEL_COLUMNS) m.label = null;
    return out;
  });

  // Minutes per week, index = weeks back from this one - for the week streak.
  let weekMinutes = $derived.by(() => {
    const totals = new Array(weeks).fill(0) as number[];
    for (let w = 0; w < weeks; w++) {
      const monday = addDays(firstMonday, (weeks - 1 - w) * 7);
      for (let d = 0; d < 7; d++) totals[w]! += days.get(addDays(monday, d))?.minutes ?? 0;
    }
    return totals;
  });

  let streakDays = $derived.by(() => {
    let streak = 0;
    for (let d = todayStr; days.has(d); d = addDays(d, -1)) streak++;
    return streak;
  });

  // Consecutive Monday-Sunday weeks with at least one training day, back
  // from this week. This week only counts once you've trained in it, but an
  // empty week still in progress doesn't break the streak either.
  let streakWeekStart = $derived((weekMinutes[0] ?? 0) > 0 ? 0 : 1);
  let streakWeeks = $derived.by(() => {
    let streak = 0;
    for (let w = streakWeekStart; w < weeks && weekMinutes[w]! > 0; w++) streak++;
    return streak;
  });

  let adherencePercent = $derived.by(() => {
    const windowDays = 14;
    let activeDays = 0;
    for (let i = 0; i < windowDays; i++) if (days.has(addDays(todayStr, -i))) activeDays++;
    return Math.round((activeDays / windowDays) * 100);
  });

  // Days in the window so far, and how many were trained.
  let windowDays = $derived.by(() => {
    let n = 0;
    for (let d = firstMonday; d <= todayStr; d = addDays(d, 1)) n++;
    return n;
  });
  let activeDays = $derived([...days.keys()].filter((d) => d >= firstMonday && d <= todayStr).length);
  let bestStreak = $derived(longestStreak(days, firstMonday, todayStr));
  let weekdays = $derived(weekdayShare(days, firstMonday, todayStr));
  let topWeekday = $derived(weekdays.indexOf(Math.max(...weekdays)));

  // Each sport's count of days it was the main sport, most first.
  let sportDays = $derived.by(() => {
    const counts = new Map<SportFamily, number>();
    for (const [d, s] of days) if (d >= firstMonday && d <= todayStr) counts.set(s.family, (counts.get(s.family) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  });

  // Hover tooltip position, computed relative to .heatmap-grid (its nearest
  // positioned ancestor) from the hovered cell's own bounding rect - not
  // tracked mouse coordinates, so the tooltip stays anchored to the cell
  // even if the pointer drifts slightly within it.
  let hoverCell = $state<Cell | null>(null);
  let hoverPos = $state<{ left: number; top: number } | null>(null);
  let gridEl = $state<HTMLDivElement | null>(null);

  function showTooltip(e: MouseEvent, cell: Cell) {
    if (cell.isFuture || cell.pad || !gridEl) return;
    const gridRect = gridEl.getBoundingClientRect();
    const cellRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverCell = cell;
    hoverPos = { left: cellRect.left - gridRect.left + cellRect.width / 2, top: cellRect.top - gridRect.top };
  }
  function hideTooltip() {
    hoverCell = null;
    hoverPos = null;
  }
</script>

<div class="consistency">
  <div class="c-head">
    <div>
      <InfoLabel class="panel-label" text="Consistency" tip="Every day of the rolling year. A day's colour is the sport you trained most that day; the deeper the shade, the more minutes. Hover a day for its date and minutes." />
      <p class="panel-prose">Every day of the rolling year: colour is the main sport, depth is minutes.</p>
    </div>
    <div class="c-stats">
      <div class="c-stat">
        <div class="c-stat-value"><span class="num">{activeDays}</span><span class="unit">/ {windowDays}</span></div>
        <InfoLabel class="c-stat-label" text="Active days" tip="Days with at least one activity in the rolling year, out of the days so far." />
      </div>
      <div class="c-stat">
        <div class="c-stat-value"><span class="num">{adherencePercent}</span><span class="unit">%</span></div>
        <InfoLabel class="c-stat-label" text="Last 14 days" tip="The share of the last 14 days, today included, with at least one activity." />
      </div>
      <div class="c-stat">
        <div class="c-stat-value"><span class="num" style="color: var(--accent);">{bestStreak}</span><span class="unit">{bestStreak === 1 ? 'day' : 'days'}</span></div>
        <InfoLabel
          class="c-stat-label"
          text="Best streak"
          tip="The longest run of consecutive training days in the rolling year. Your current streak is {streakDays} {streakDays === 1 ? 'day' : 'days'}."
        />
      </div>
      <div class="c-stat">
        <div class="c-stat-value"><span class="num" style="color: var(--positive);">{streakWeeks}</span><span class="unit">{streakWeeks === 1 ? 'week' : 'weeks'}</span></div>
        <InfoLabel class="c-stat-label" text="Week streak" tip="Consecutive Monday-Sunday weeks with at least one session, up to this week. A week still in progress doesn't break it." />
      </div>
    </div>
  </div>

  <div class="c-body">
    <div class="heatmap-grid" bind:this={gridEl} use:touchHover>
      <div class="heatmap-day-labels">
        {#each DAY_LABELS as label, i (i)}
          <span class="day-label mono">{label}</span>
        {/each}
      </div>
      {#each months as month, mi (mi)}
        <div class="heatmap-month" style="flex-grow: {month.columns.length};">
          {#if month.label}
            <!-- A phone's month blocks are too narrow for three letters. -->
            <span class="month-label mono">{phone.current ? month.label[0] : month.label}</span>
          {/if}
          {#each month.columns as col, ci (ci)}
            <div class="heatmap-column">
              {#each col.cells as cell (cell.date)}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="heatmap-cell"
                  class:rest={cell.isRest && !cell.pad}
                  class:future={cell.isFuture || cell.pad}
                  class:today={cell.isToday && !cell.pad}
                  style={cell.isFuture || cell.pad || !cell.color ? '' : `background: ${cell.color};`}
                  onmouseenter={(e) => showTooltip(e, cell)}
                  onmouseleave={hideTooltip}
                ></div>
              {/each}
            </div>
          {/each}
        </div>
      {/each}

      {#if hoverCell && hoverPos}
        <div class="chart-tooltip" style="left: {hoverPos.left}px; top: {hoverPos.top}px;">
          <div class="chart-tooltip-row">
            <span class="chart-tooltip-label">{formatDateLong(hoverCell.date)}</span>
            <span class="chart-tooltip-value">
              {hoverCell.minutes > 0 && hoverCell.family ? `${familyShortLabel(hoverCell.family)} · ${Math.round(hoverCell.minutes)} min` : 'Rest'}
            </span>
          </div>
        </div>
      {/if}
    </div>

    <div class="c-side">
      {#each weekdays as share, i (i)}
        <div class="weekday" title="Trained on {share === 0 ? 'no' : `${Math.round(share * 100)}% of`} {['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'][i]}">
          <span class="weekday-track"><span class="weekday-fill" class:top={i === topWeekday && share > 0} style="width: {share * 100}%;"></span></span>
          <span class="weekday-pct mono">{Math.round(share * 100)}%</span>
        </div>
      {/each}
    </div>
  </div>

  <div class="c-foot">
    <div class="sports">
      {#each sportDays as [family, count] (family)}
        <span class="sport mono"><span class="swatch" style="background: {familyColorVar(family)};"></span>{familyShortLabel(family)} <span class="sport-days">{count}d</span></span>
      {/each}
    </div>
    <!-- Grey rather than any sport's colour: the shade steps apply to
         every sport alike. -->
    <div class="depth mono">
      <span class="depth-title">shade = minutes</span>
      <span class="depth-end">&lt;{DEPTH_LIMITS[0]}m</span>
      {#each DEPTH_MIX.slice(1) as mix (mix)}
        <span class="swatch" style="background: color-mix(in srgb, var(--ink-2) {mix}%, var(--bg-well));"></span>
      {/each}
      <span class="depth-end">{DEPTH_LIMITS[DEPTH_LIMITS.length - 1]! / 60}h+</span>
    </div>
  </div>
</div>

<style>
  .consistency {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  .c-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-8);
    flex-wrap: wrap;
  }
  .c-stats {
    display: flex;
    gap: var(--space-10);
    flex-wrap: wrap;
  }
  .c-stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .c-stat-value {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    white-space: nowrap;
  }
  .num {
    font-family: var(--font-mono);
    font-size: var(--fs-3xl);
    letter-spacing: var(--tracking-tight);
    line-height: 1;
    color: var(--ink-1);
  }
  .unit {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    color: var(--ink-5);
  }
  :global(.c-stat-label) {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-6);
  }

  .c-body {
    display: flex;
    gap: var(--space-7);
  }
  .heatmap-grid {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: var(--space-1);
    position: relative;
    padding-top: 16px; /* room for the month labels */
  }
  .heatmap-day-labels {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-right: var(--space-2);
  }
  .day-label {
    font-size: var(--fs-xs);
    color: var(--ink-6);
    height: 14px;
    line-height: 14px;
  }
  .heatmap-month {
    display: flex;
    gap: var(--space-1);
    flex: 1 1 0;
    min-width: 0;
    position: relative;
  }
  .heatmap-month + .heatmap-month {
    margin-left: var(--space-2);
  }
  .month-label {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 3px;
    font-size: var(--fs-xs);
    line-height: 12px;
    color: var(--ink-5);
    white-space: nowrap;
  }
  .heatmap-column {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }
  .heatmap-cell {
    height: 14px;
    border-radius: 2px;
    background: var(--bg-well);
  }
  .heatmap-cell.rest {
    box-shadow: inset 0 0 0 1px var(--bg-row-hover);
  }
  .heatmap-cell.future {
    background: transparent;
  }
  .heatmap-cell.today {
    box-shadow: 0 0 0 1.5px var(--ink-1);
  }

  .c-side {
    flex: none;
    width: 112px;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: 16px 0 0 var(--space-7);
    border-left: 1px solid var(--line-soft);
  }
  .weekday {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    height: 14px;
  }
  .weekday-track {
    flex: 1;
    height: 4px;
    background: var(--bg-well);
    border-radius: 1px;
  }
  .weekday-fill {
    display: block;
    height: 100%;
    background: var(--neutral-line);
    border-radius: 1px;
  }
  .weekday-fill.top {
    background: var(--accent);
  }
  .weekday-pct {
    width: 4ch;
    text-align: right;
    font-size: var(--fs-xs);
    color: var(--ink-4);
  }

  .c-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-6);
    flex-wrap: wrap;
    padding-top: var(--space-6);
    border-top: 1px solid var(--line-soft);
  }
  .sports {
    display: flex;
    gap: var(--space-8);
    flex-wrap: wrap;
  }
  .sport {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--fs-xs);
    color: var(--ink-3);
  }
  .sport-days {
    color: var(--ink-6);
  }
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  .depth {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-xs);
    color: var(--ink-6);
  }
  .depth-title {
    margin-right: var(--space-5);
    color: var(--ink-5);
  }
  .depth-end {
    margin: 0 var(--space-2);
  }

  /* Narrow panels: the weekday column goes and the cells shrink. */
  @container (max-width: 720px) {
    .c-side {
      display: none;
    }
    .heatmap-cell,
    .day-label {
      height: 12px;
      line-height: 12px;
    }
    .c-stats {
      display: grid;
      grid-template-columns: repeat(2, auto);
      gap: var(--space-6) var(--space-8);
    }
    /* A phone's columns are only a few px wide - a ring there reads as a
       stray "0" rather than a cell. */
    .heatmap-cell.today {
      box-shadow: none;
    }
    .num {
      font-size: var(--fs-2xl);
    }
  }
</style>
