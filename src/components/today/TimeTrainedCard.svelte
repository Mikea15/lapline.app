<!-- TimeTrainedCard.svelte - Today's total training time over the header's
     range: the figure, bars for the three biggest sports (the rest listed in
     the footer), and the weekly average. -->
<script lang="ts">
  import KpiCard from './KpiCard.svelte';
  import type { Activity } from '../../lib/types';
  import { timeBySport } from '../../lib/today-kpis';
  import { familyColorVar, familyShortLabel } from '../../lib/sport-color';

  interface Props {
    activities: Activity[];
    rangeDays: number;
    rangeLabel: string;
  }

  let { activities, rangeDays, rangeLabel }: Props = $props();

  const SHOWN = 3;

  let sports = $derived(timeBySport(activities, rangeDays));
  let totalHours = $derived(sports.reduce((s, x) => s + x.hours, 0));
  let top = $derived(sports.slice(0, SHOWN));
  let rest = $derived(sports.slice(SHOWN));
  let maxHours = $derived(top[0]?.hours ?? 0);
  let perWeek = $derived(totalHours / Math.max(1, rangeDays / 7));

  function hoursMinutes(h: number): string {
    const totalMin = Math.round(h * 60);
    return `${Math.floor(totalMin / 60)}:${String(totalMin % 60).padStart(2, '0')}`;
  }
  const roundHours = (h: number) => (h >= 1 ? `${Math.round(h)}h` : `${Math.round(h * 60)}m`);
</script>

<KpiCard
  label="Time trained"
  tip="Total hours spent training over the selected range, across all sports, with the three biggest sports broken out and the weekly average."
  edge="var(--ink-5)"
  meta="{sports.length} {sports.length === 1 ? 'sport' : 'sports'}"
  chip={totalHours > 0 ? { text: `${hoursMinutes(perWeek)} h/wk`, tone: 'neutral' } : null}
  caption={totalHours === 0 ? `nothing in ${rangeLabel}` : rest.length > 0 ? `+ ${rest.map((r) => `${familyShortLabel(r.family).toLowerCase()} ${roundHours(r.hours)}`).join(' · ')}` : 'avg'}
>
  <div class="kpi-value-row">
    <span class="kpi-value">{hoursMinutes(totalHours)}</span>
    <span class="kpi-unit">h</span>
  </div>
  {#if top.length > 0}
    <div class="sports">
      {#each top as s (s.family)}
        <span class="name mono">{familyShortLabel(s.family)}</span>
        <span class="track"><span class="fill" style="width: {(s.hours / maxHours) * 100}%; background: {familyColorVar(s.family)};"></span></span>
        <span class="hours mono">{roundHours(s.hours)}</span>
      {/each}
    </div>
  {/if}
</KpiCard>

<style>
  .sports {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    column-gap: var(--space-6);
    row-gap: var(--space-3);
  }
  .name {
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-6);
    min-width: 5ch;
  }
  .track {
    height: 4px;
    background: var(--bg-well);
    border-radius: 1px;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 1px;
  }
  .hours {
    font-size: var(--fs-xs);
    color: var(--ink-3);
    text-align: right;
  }
</style>
