<!-- TimeInZonePanel.svelte - Today's Time in zone panel over the header's
     range: the easy / moderate / hard split against polarised-training
     targets, the full zone bar with the 80% easy target marked, each week's
     zone mix as a 100% stacked column, and time per zone. -->
<script lang="ts">
  import InfoLabel from '../InfoLabel.svelte';
  import type { Activity } from '../../lib/types';
  import { ZONE_COLORS, ZONE_NAMES } from '../../lib/hr-zones';
  import { zoneSeconds, weeklyZoneSeconds, intensityShares, POLARISED_TARGETS, type IntensityShare } from '../../lib/today-kpis';
  import { bucketStartDate, formatDateShort } from '../../lib/date-utils';
  import { settingsStore } from '../../lib/stores.svelte';
  import { axisLabelSlots } from '../../lib/chart-scale';

  interface Props {
    activities: Activity[];
    rangeDays: number;
    rangeLabel: string;
    weeksShown: number;
  }

  let { activities, rangeDays, rangeLabel, weeksShown }: Props = $props();

  let zones = $derived(zoneSeconds(activities, rangeDays));
  let total = $derived(zones.reduce((s, v) => s + v, 0));
  let shares = $derived(intensityShares(zones));
  let weeks = $derived(weeklyZoneSeconds(activities, weeksShown));
  let maxZone = $derived(Math.max(1, ...zones));

  function hm(sec: number): string {
    const totalMin = Math.round(sec / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  const SHARE_META: Record<IntensityShare['key'], { label: string; zones: string; color: string }> = {
    easy: { label: 'Easy', zones: 'Z1-2', color: 'var(--zone-1)' },
    moderate: { label: 'Moderate', zones: 'Z3', color: 'var(--zone-3)' },
    hard: { label: 'Hard', zones: 'Z4-5', color: 'var(--zone-5)' }
  };

  function targetText(s: IntensityShare): string {
    if (s.onTarget) return `target ${s.target}% · on target`;
    const d = Math.round(s.pct) - s.target;
    return `target ${s.target}% · ${d > 0 ? '+' : ''}${d} pts`;
  }

  // "12w" -> "the last 12 weeks", for the caption; a custom range's label
  // (a date span) reads fine as it is.
  let rangePhrase = $derived.by(() => {
    const m = /^(\d+)([dwy])$/.exec(rangeLabel);
    if (!m) return rangeLabel === 'All' ? 'all time' : rangeLabel;
    const n = Number(m[1]);
    const unit = { d: 'day', w: 'week', y: 'year' }[m[2] as 'd' | 'w' | 'y'];
    return n === 1 ? `the last ${unit}` : `the last ${n} ${unit}s`;
  });

  // Week labels thinned to fit, counted back from this week; a month's
  // first label shows the month, the rest just the day.
  let weeksWidth = $state(0);
  let weekLabels = $derived.by(() => {
    const labels = new Array<string>(weeksShown).fill('');
    let prevMonth = '';
    const slots = axisLabelSlots(weeksShown, weeksWidth / Math.max(1, weeksShown), 6 * 11 * settingsStore.getTextScale() * 0.6 + 12);
    const shown = [...slots].sort((a, b) => a - b);
    for (const i of shown) {
      const [day, month] = formatDateShort(bucketStartDate(i, weeksShown, 7)).split(' ') as [string, string];
      labels[i] = month === prevMonth ? day : `${day} ${month}`;
      prevMonth = month;
    }
    return labels;
  });
</script>

<div class="tiz">
  <div class="tiz-head">
    <div class="tiz-title">
      <InfoLabel class="panel-label" text="Time in zone" tip="How training time over the selected range (the header's range filter, top right) splits across heart-rate zones 1-5, against a polarised plan's targets." />
      <p class="panel-prose">
        {total > 0 ? `${hm(total)} over ${rangePhrase}.` : `No heart-rate zone data in ${rangePhrase}.`} Polarised training puts ~{POLARISED_TARGETS.easy}% easy, ~{POLARISED_TARGETS.hard}% hard, and little in between.
      </p>
    </div>
    {#if shares}
      <div class="tiz-stats">
        {#each shares as s (s.key)}
          <div class="tiz-stat">
            <div class="tiz-stat-value"><span class="num mono" style="color: {SHARE_META[s.key].color};">{Math.round(s.pct)}</span><span class="unit mono">%</span></div>
            <span class="tiz-stat-label mono">{SHARE_META[s.key].label} · {SHARE_META[s.key].zones}</span>
            <span class="tiz-target mono" style="color: {s.onTarget ? 'var(--positive)' : 'var(--caution)'};">{targetText(s)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if total > 0}
    <div class="zone-bar">
      {#each zones as v, i (i)}
        {#if v > 0}
          <div class="zone-seg mono" style="flex: {v} 0 0; background: {ZONE_COLORS[i]};" title="Z{i + 1} {ZONE_NAMES[i]}: {hm(v)} · {Math.round((v / total) * 100)}%">
            <b>Z{i + 1}</b><span class="zone-seg-detail">{hm(v)} · {Math.round((v / total) * 100)}%</span>
          </div>
        {/if}
      {/each}
      <span class="target" style="left: {POLARISED_TARGETS.easy}%;"><span class="target-label mono">{POLARISED_TARGETS.easy}% easy target</span></span>
    </div>

    <div class="tiz-lower">
      <div class="weeks-block">
        <span class="sub-label mono">Week by week · share of time</span>
        <div class="weeks" bind:clientWidth={weeksWidth}>
          {#each weeks as w, i (i)}
            {@const wt = w.reduce((s, v) => s + v, 0)}
            <div class="week" title={wt > 0 ? `${weekLabels[i] || formatDateShort(bucketStartDate(i, weeksShown, 7))}: ${hm(wt)}` : 'no zone data'}>
              {#if wt > 0}
                {#each w as v, z (z)}
                  {#if v > 0}<span style="flex: {v} 0 0; background: {ZONE_COLORS[z]};"></span>{/if}
                {/each}
              {:else}
                <span class="empty"></span>
              {/if}
            </div>
          {/each}
        </div>
        <div class="week-labels">
          {#each weekLabels as l, i (i)}
            <span class="week-label mono">{#if l}<span class="week-label-text">{l}</span>{/if}</span>
          {/each}
        </div>
      </div>

      <div class="zone-list">
        {#each zones as v, i (i)}
          <span class="zl-zone mono" style="color: {ZONE_COLORS[i]};">Z{i + 1}</span>
          <span class="zl-name">{ZONE_NAMES[i]}</span>
          <span class="zl-track"><span style="width: {(v / maxZone) * 100}%; background: {ZONE_COLORS[i]};"></span></span>
          <span class="zl-time mono">{hm(v)}</span>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .tiz {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  .tiz-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-8);
    flex-wrap: wrap;
  }
  .tiz-title {
    flex: 1 1 280px;
  }
  .tiz-stats {
    display: flex;
    gap: var(--space-10);
    flex-wrap: wrap;
  }
  .tiz-stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .tiz-stat-value {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .num {
    font-size: var(--fs-3xl);
    letter-spacing: var(--tracking-tight);
    line-height: 1;
  }
  .unit {
    font-size: var(--fs-sm);
    color: var(--ink-5);
  }
  .tiz-stat-label {
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-6);
  }
  .tiz-target {
    font-size: var(--fs-xs);
  }

  .zone-bar {
    position: relative;
    display: flex;
    gap: var(--space-1);
    height: 34px;
    margin-top: var(--space-6);
  }
  .zone-seg {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: 0 var(--space-5);
    border-radius: 2px;
    font-size: var(--fs-xs);
    color: var(--bg-app);
    white-space: nowrap;
    overflow: hidden;
  }
  .zone-seg b {
    font-weight: var(--fw-bold);
  }
  .zone-seg-detail {
    overflow: hidden;
    text-overflow: clip;
    opacity: 0.85;
  }
  .target {
    position: absolute;
    top: -6px;
    bottom: -6px;
    border-left: 2px dashed var(--ink-1);
    margin-left: -1px;
  }
  .target-label {
    position: absolute;
    bottom: 100%;
    left: 0;
    transform: translateX(-50%);
    margin-bottom: var(--space-1);
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-1);
    white-space: nowrap;
  }

  .tiz-lower {
    display: grid;
    grid-template-columns: minmax(0, 1.8fr) minmax(240px, 1fr);
    gap: var(--space-10);
    align-items: end;
  }
  .weeks-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  .sub-label {
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-6);
  }
  .weeks {
    display: flex;
    gap: var(--space-2);
    height: 76px;
  }
  .week {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column-reverse;
    gap: 1px;
    border-radius: 2px;
    overflow: hidden;
  }
  .week .empty {
    flex: 1;
    background: var(--bg-well);
  }
  .week-labels {
    display: flex;
    gap: var(--space-2);
  }
  /* Each label is centred on its week, overflowing the narrow slot; the
     first and last are pinned to the chart's edges instead, so they can't
     be clipped (text overflowing its box ignores text-align). */
  .week-label {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 1.4em;
    font-size: var(--fs-xs);
    color: var(--ink-6);
  }
  .week-label-text {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .week-label:first-child .week-label-text {
    left: 0;
    transform: none;
  }
  .week-label:last-child .week-label-text {
    left: auto;
    right: 0;
    transform: none;
  }
  .zone-list {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    align-items: center;
    column-gap: var(--space-6);
    row-gap: var(--space-4);
  }
  .zl-zone {
    font-size: var(--fs-xs);
    font-weight: var(--fw-semibold);
  }
  .zl-name {
    font-size: var(--fs-sm);
    color: var(--ink-3);
  }
  .zl-track {
    height: 6px;
    background: var(--bg-well);
    border-radius: 1px;
  }
  .zl-track span {
    display: block;
    height: 100%;
    border-radius: 1px;
  }
  .zl-time {
    font-size: var(--fs-xs);
    color: var(--ink-2);
    text-align: right;
  }

  @container (max-width: 720px) {
    .tiz-lower {
      grid-template-columns: 1fr;
    }
    .tiz-stats {
      gap: var(--space-8);
    }
    .num {
      font-size: var(--fs-2xl);
    }
  }
</style>
