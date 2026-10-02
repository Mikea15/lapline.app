<!-- DayStrip.svelte - one cell per day of a month, for the Calendar's
     Sessions and Rest days cards: a day's colour (its main sport, or the
     rest colour), with days still to come drawn faint. -->
<script lang="ts">
  export interface StripDay {
    date: string;
    /** Fill colour, or null for an empty (rest) day. */
    color: string | null;
    future: boolean;
    title: string;
  }

  interface Props {
    days: StripDay[];
    /** Colour for an empty, already-past day. */
    emptyColor?: string;
  }

  let { days, emptyColor = 'var(--bg-well)' }: Props = $props();
</script>

<div class="strip">
  {#each days as d (d.date)}
    <span class="day" class:future={d.future} style="background: {d.color ?? emptyColor};" title={d.title}></span>
  {/each}
</div>

<style>
  .strip {
    display: flex;
    gap: 2px;
    height: 22px;
  }
  .day {
    flex: 1;
    min-width: 0;
    border-radius: 1px;
  }
  .day.future {
    background: transparent !important;
    box-shadow: inset 0 0 0 1px var(--line-soft);
  }
</style>
