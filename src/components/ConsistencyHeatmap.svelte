<!-- ConsistencyHeatmap.svelte - a rolling-year (52-week) x 7-day training-minutes
     calendar, a legend, current streak and adherence over the last 14 days.
     Each day cell has a proper hover tooltip (its full date + minutes
     trained) rather than relying on the browser's native title attribute,
     which showed no date at all and is slow, unstyled, and easy to miss. -->
<script lang="ts">
  import type { Activity } from '../lib/types';
  import { formatDateLong, dateToStr } from '../lib/date-utils';

  interface Props {
    activities: Activity[];
    weeks?: number;
  }

  let { activities, weeks = 52 }: Props = $props();

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const RAMP = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)'];

  function startOfWeekMonday(d: Date): Date {
    const day = (d.getDay() + 6) % 7; // 0 = Monday
    const s = new Date(d);
    s.setHours(0, 0, 0, 0);
    s.setDate(s.getDate() - day);
    return s;
  }

  let minutesByDate = $derived.by(() => {
    const m = new Map<string, number>();
    for (const a of activities) {
      m.set(a.date, (m.get(a.date) ?? 0) + a.durationMin);
    }
    return m;
  });

  function rampIndex(minutes: number): number {
    if (minutes <= 0) return 0;
    if (minutes < 35) return 1;
    if (minutes < 60) return 2;
    if (minutes < 85) return 3;
    return 4;
  }

  interface Cell {
    date: string;
    minutes: number;
    isFuture: boolean;
    isRest: boolean;
    color: string;
  }

  let today = $derived.by(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });

  let columns = $derived.by(() => {
    const thisWeekMonday = startOfWeekMonday(today);
    const cols: Cell[][] = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const weekStart = new Date(thisWeekMonday);
      weekStart.setDate(weekStart.getDate() - w * 7);
      const col: Cell[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + d);
        const dateStr = dateToStr(date);
        const isFuture = date > today;
        const minutes = minutesByDate.get(dateStr) ?? 0;
        col.push({ date: dateStr, minutes, isFuture, isRest: !isFuture && minutes <= 0, color: RAMP[rampIndex(minutes)]! });
      }
      cols.push(col);
    }
    return cols;
  });

  let streakDays = $derived.by(() => {
    let streak = 0;
    const d = new Date(today);
    while (true) {
      const dateStr = dateToStr(d);
      if ((minutesByDate.get(dateStr) ?? 0) <= 0) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  });

  let adherencePercent = $derived.by(() => {
    const windowDays = 14;
    let activeDays = 0;
    const d = new Date(today);
    for (let i = 0; i < windowDays; i++) {
      if ((minutesByDate.get(dateToStr(d)) ?? 0) > 0) activeDays++;
      d.setDate(d.getDate() - 1);
    }
    return Math.round((activeDays / windowDays) * 100);
  });

  // Hover tooltip position, computed relative to .heatmap-grid (its nearest
  // positioned ancestor) from the hovered cell's own bounding rect - not
  // tracked mouse coordinates, so the tooltip stays anchored to the cell
  // even if the pointer drifts slightly within it.
  let hoverCell = $state<Cell | null>(null);
  let hoverPos = $state<{ left: number; top: number } | null>(null);
  let gridEl = $state<HTMLDivElement | null>(null);

  function showTooltip(e: MouseEvent, cell: Cell) {
    if (cell.isFuture || !gridEl) return;
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

<div class="heatmap">
  <div class="heatmap-grid" bind:this={gridEl}>
    <div class="heatmap-day-labels">
      {#each DAY_LABELS as label, i (i)}
        <span class="day-label mono">{label}</span>
      {/each}
    </div>
    {#each columns as col, ci (ci)}
      <div class="heatmap-column">
        {#each col as cell (cell.date)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="heatmap-cell"
            class:rest={cell.isRest}
            class:future={cell.isFuture}
            style={cell.isFuture ? '' : `background: ${cell.color};`}
            onmouseenter={(e) => showTooltip(e, cell)}
            onmouseleave={hideTooltip}
          ></div>
        {/each}
      </div>
    {/each}

    {#if hoverCell && hoverPos}
      <div class="chart-tooltip" style="left: {hoverPos.left}px; top: {hoverPos.top}px;">
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label">{formatDateLong(hoverCell.date)}</span>
          <span class="chart-tooltip-value">{hoverCell.minutes > 0 ? `${Math.round(hoverCell.minutes)} min` : 'Rest'}</span>
        </div>
      </div>
    {/if}
  </div>

  <div class="heatmap-legend">
    <span class="legend-text mono">less</span>
    {#each RAMP as color (color)}
      <span class="legend-swatch" style="background: {color};"></span>
    {/each}
    <span class="legend-text mono">more</span>
    <span class="legend-stats mono">{streakDays}-day streak · {adherencePercent}% adherence</span>
  </div>
</div>

<style>
  .heatmap {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .heatmap-grid {
    display: flex;
    gap: var(--space-1);
    position: relative;
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
    height: 12px;
    line-height: 12px;
  }
  .heatmap-column {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }
  .heatmap-cell {
    height: 12px;
    border-radius: 1px;
  }
  .heatmap-cell.rest {
    box-shadow: inset 0 0 0 1px var(--bg-row-hover);
  }
  .heatmap-cell.future {
    background: transparent;
  }
  .heatmap-legend {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-top: var(--space-4);
    border-top: 1px solid var(--line-soft);
  }
  .legend-text {
    font-size: var(--fs-xs);
    color: var(--ink-6);
  }
  .legend-swatch {
    width: 9px;
    height: 9px;
    border-radius: 1px;
  }
  .legend-stats {
    margin-left: auto;
    font-size: var(--fs-xs);
    color: var(--ink-5);
  }
</style>
