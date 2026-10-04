<!-- SportBars.svelte - the biggest sports as labelled bars, as on Today's
     Time trained card; shared with the Calendar and Trends top rows. -->
<script lang="ts">
  import { familyColorVar, familyShortLabel } from '../../lib/sport-color';
  import type { SportTime } from '../../lib/today-kpis';

  interface Props {
    sports: SportTime[];
  }

  let { sports }: Props = $props();

  let max = $derived(sports[0]?.hours ?? 0);
  const roundHours = (h: number) => (h >= 1 ? `${Math.round(h)}h` : `${Math.round(h * 60)}m`);
</script>

<div class="sports">
  {#each sports as s (s.family)}
    <span class="name mono">{familyShortLabel(s.family)}</span>
    <span class="track"><span class="fill" style="width: {max > 0 ? (s.hours / max) * 100 : 0}%; background: {familyColorVar(s.family)};"></span></span>
    <span class="hours mono">{roundHours(s.hours)}</span>
  {/each}
</div>

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
    color: var(--ink-5);
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
