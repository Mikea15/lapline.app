<!-- ActivityFilterBar.svelte - Activities-list filter: narrows the ledger
     below to any combination of sport families. Sorting is handled by the
     ledger's own clickable column headers, not repeated here - reuses the
     same panel/control styling and the same ActivityTypeFilter component as
     Trends' filter bar, so the two pages' Activity Type filters look and
     behave identically rather than diverging into two implementations. -->
<script lang="ts">
  import type { SportFamily } from '../lib/sport-color';
  import InfoLabel from './InfoLabel.svelte';
  import ActivityTypeFilter from './ActivityTypeFilter.svelte';

  interface Props {
    /** Empty = "all sports" (no filter). Non-empty = only these sports,
        unioned together - toggled per-sport by clicking its pill below. */
    activityTypes: Set<SportFamily>;
  }

  let { activityTypes = $bindable() }: Props = $props();
</script>

<div class="panel trends-filter-bar">
  <div class="panel-label trends-filter-title">Filter</div>
  <div class="trends-filter-controls">
    <div class="trends-filter-field">
      <InfoLabel
        class="panel-label"
        text="Activity Type"
        tip="Select one or more sports to filter by."
      />
      <ActivityTypeFilter bind:selected={activityTypes} />
    </div>
  </div>
</div>
