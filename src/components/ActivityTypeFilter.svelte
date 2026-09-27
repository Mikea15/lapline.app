<!-- ActivityTypeFilter.svelte - shared multi-select sport-type toggle, used
     by both the Trends and Activities pages' filter bars so the control
     (and its behavior) isn't duplicated per page. Click a sport's name to
     toggle it on/off - multiple can be active at once (activities matching
     any selected sport are included), and none active means "all sports"
     rather than "none". -->
<script lang="ts">
  import type { SportFamily } from '../lib/sport-color';
  import { familyLabel, familyColorVar } from '../lib/sport-color';
  import { trackEvent } from '../lib/analytics';

  interface Props {
    selected: Set<SportFamily>;
  }

  let { selected = $bindable() }: Props = $props();

  const SPORTS: SportFamily[] = ['running', 'cycling', 'pool-swim', 'cardio', 'climbing', 'other'];

  function toggle(t: SportFamily) {
    const next = new Set(selected);
    if (next.has(t)) {
      next.delete(t);
    } else {
      next.add(t);
      trackEvent('sport_filter_toggled', { sport: t });
    }
    selected = next;
  }
  function selectAll() {
    selected = new Set();
    trackEvent('sport_filter_reset');
  }
</script>

<div class="segmented sport-filter" role="group" aria-label="Activity Type">
  <button type="button" class:active={selected.size === 0} onclick={selectAll}>All sports</button>
  {#each SPORTS as t (t)}
    <button type="button" class:active={selected.has(t)} onclick={() => toggle(t)}>
      <span class="filter-pill-swatch" style="background: {familyColorVar(t)};"></span>
      {familyLabel(t)}
    </button>
  {/each}
</div>
