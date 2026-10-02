<!-- TrendsFilterBar.svelte - Trends page filter: Activity Type narrows which
     activities are included (click a sport's name to toggle it on/off -
     multiple can be active at once to compare them against each other; none
     active means "all sports", not "none"), Subject picks whether the
     volume chart plots distance or time (and which value-range slider is
     active below), and the value-range slider narrows activities to a band
     of distances or a band of durations, matching Subject. All three sit on
     one row (wrapping on narrow screens) with no titles, to keep it compact,
     after the date-range picker App passes in -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SportFamily } from '../lib/sport-color';
  import ValueRangeSlider from './ValueRangeSlider.svelte';
  import ActivityTypeFilter from './ActivityTypeFilter.svelte';
  import { settingsStore } from '../lib/stores.svelte';
  import { formatDistance } from '../lib/units';

  export type Subject = 'distance' | 'time';

  interface Props {
    /** App's shared date-range picker (RangeFilter), rendered first. */
    rangeFilter: Snippet;
    /** Empty = "all sports" (no filter). Non-empty = only these sports,
        unioned together - toggled per-sport by clicking its pill below. */
    activityTypes: Set<SportFamily>;
    subject: Subject;
    distanceMin: number;
    distanceMax: number;
    distanceStart: number;
    distanceEnd: number;
    timeMin: number;
    timeMax: number;
    timeStart: number;
    timeEnd: number;
  }

  let {
    rangeFilter,
    activityTypes = $bindable(),
    subject = $bindable(),
    distanceMin,
    distanceMax,
    distanceStart = $bindable(),
    distanceEnd = $bindable(),
    timeMin,
    timeMax,
    timeStart = $bindable(),
    timeEnd = $bindable()
  }: Props = $props();

  const SUBJECTS: { key: Subject; label: string }[] = [
    { key: 'distance', label: 'Distance' },
    { key: 'time', label: 'Time' }
  ];

  function formatKm(v: number): string {
    return formatDistance(v, settingsStore.getUnitSystem(), 1);
  }
  function formatMinutes(v: number): string {
    const h = Math.floor(v / 60);
    const m = Math.round(v % 60);
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  }
</script>

<div class="panel filter-bar" role="group" aria-label="Filter">
  {@render rangeFilter()}

  <ActivityTypeFilter bind:selected={activityTypes} />

  <div
    class="segmented"
    role="tablist"
    aria-label="Subject"
    title="Plot the weekly volume chart, and filter the range, by distance or by time"
  >
    {#each SUBJECTS as s (s.key)}
      <button type="button" class:active={subject === s.key} onclick={() => (subject = s.key)}>{s.label}</button>
    {/each}
  </div>

  <div class="filter-bar-range" title="Drag either handle to only include activities within this {subject === 'distance' ? 'distance' : 'duration'} band">
    {#if subject === 'distance'}
      <ValueRangeSlider min={distanceMin} max={distanceMax} bind:start={distanceStart} bind:end={distanceEnd} step={0.1} formatValue={formatKm} />
    {:else}
      <ValueRangeSlider min={timeMin} max={timeMax} bind:start={timeStart} bind:end={timeEnd} step={1} formatValue={formatMinutes} />
    {/if}
  </div>
</div>
