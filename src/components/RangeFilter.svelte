<!-- RangeFilter.svelte - the date-range picker (7d/4w/12w/1y/All/Custom)
     shown inside the Trends filter bar. Its state lives in App.svelte,
     which hands it to the screen as a snippet. Renders two flex items for
     the .filter-bar row: the preset buttons, and (Custom only) a
     full-width date slider. -->
<script lang="ts">
  import { RANGE_PRESET_OPTIONS, rangePresetLabel, type RangePreset } from '../lib/range-preset';
  import { trackEvent } from '../lib/analytics';
  import DateRangeSlider from './DateRangeSlider.svelte';

  interface Props {
    preset: RangePreset | 'custom';
    customStart: string;
    customEnd: string;
    /** The window the active preset resolves to - seeds the custom slider
        so switching to Custom doesn't jump the range around. */
    rangeStart: string;
    rangeEnd: string;
    historyMin: string;
    historyMax: string;
  }

  let {
    preset = $bindable(),
    customStart = $bindable(),
    customEnd = $bindable(),
    rangeStart,
    rangeEnd,
    historyMin,
    historyMax
  }: Props = $props();

  function setPreset(next: RangePreset) {
    preset = next;
    trackEvent('range_changed', { preset: next });
  }

  function activateCustom() {
    if (preset === 'custom') return;
    // Clamped to the slider's bounds: a 1y window usually starts before the
    // first activity, which would put the start handle off the track.
    customStart = rangeStart < historyMin ? historyMin : rangeStart;
    customEnd = rangeEnd > historyMax ? historyMax : rangeEnd;
    preset = 'custom';
    trackEvent('range_changed', { preset: 'custom' });
  }
</script>

<div class="segmented" role="group" aria-label="Date range">
  {#each RANGE_PRESET_OPTIONS as r (r)}
    <button type="button" class:active={preset === r} aria-pressed={preset === r} onclick={() => setPreset(r)}>{rangePresetLabel(r)}</button>
  {/each}
  <button type="button" class:active={preset === 'custom'} aria-pressed={preset === 'custom'} onclick={activateCustom}>Custom</button>
</div>

{#if preset === 'custom'}
  <div class="filter-bar-dates">
    <DateRangeSlider min={historyMin} max={historyMax} bind:start={customStart} bind:end={customEnd} />
  </div>
{/if}
