<!-- TrendsFilterBar.svelte - Trends page filter: Activity Type narrows which
     activities are included (click a sport's name to toggle it on/off -
     multiple can be active at once to compare them against each other; none
     active means "all sports", not "none"), Subject picks whether the
     volume chart plots distance or time (and which value-range slider is
     active below), and the value-range slider narrows activities to a band
     of distances or a band of durations, matching Subject. The date window
     itself is the header's global range control, not repeated here. -->
<script lang="ts">
  import type { SportFamily } from '../lib/sport-color';
  import ValueRangeSlider from './ValueRangeSlider.svelte';
  import InfoLabel from './InfoLabel.svelte';
  import ActivityTypeFilter from './ActivityTypeFilter.svelte';

  export type Subject = 'distance' | 'time';

  interface Props {
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
    return `${v.toFixed(1)} km`;
  }
  function formatMinutes(v: number): string {
    const h = Math.floor(v / 60);
    const m = Math.round(v % 60);
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  }
</script>

<div class="panel trends-filter-bar">
  <div class="panel-label trends-filter-title">Filter</div>

  <div class="trends-filter-controls">
    <div class="trends-filter-field">
      <InfoLabel
        class="panel-label"
        text="Activity Type"
        tip="Click a sport to narrow every stat and chart on this page to it - click more than one to compare them against each other. None selected means all sports."
      />
      <ActivityTypeFilter bind:selected={activityTypes} />
    </div>

    <div class="trends-filter-field">
      <InfoLabel class="panel-label" text="Subject" tip="Chooses whether the weekly volume chart plots distance (km) or time (hours), and whether the range below scrubs distance or time." />
      <div class="segmented" role="tablist" aria-label="Subject">
        {#each SUBJECTS as s (s.key)}
          <button type="button" class:active={subject === s.key} onclick={() => (subject = s.key)}>{s.label}</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="trends-filter-row">
    {#if subject === 'distance'}
      <InfoLabel class="panel-label" text="Distance range" tip="Drag either handle to only include activities within this distance band." />
      <ValueRangeSlider min={distanceMin} max={distanceMax} bind:start={distanceStart} bind:end={distanceEnd} step={0.1} formatValue={formatKm} />
    {:else}
      <InfoLabel class="panel-label" text="Time range" tip="Drag either handle to only include activities within this duration band." />
      <ValueRangeSlider min={timeMin} max={timeMax} bind:start={timeStart} bind:end={timeEnd} step={1} formatValue={formatMinutes} />
    {/if}
  </div>
</div>
