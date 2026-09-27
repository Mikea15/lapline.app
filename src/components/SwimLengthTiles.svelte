<!-- SwimLengthTiles.svelte - Tape view's "length by length" tile grid
     (bug-list.md), the pool-swim equivalent of KmTiles.svelte: one tile per
     real active length, with its own real HR-trace sparkline, pace/100m vs
     the session average, real SWOLF, and the real HR-zone time mix for that
     length. Consecutive rest lengths (the FIT file often splits one real
     pause into several short `length` messages) are merged into one plain
     "Rest" tile, matching SwimSplitsTable.svelte's row-merging - not shown
     as a run of near-identical tiles, and not styled as a swum length since
     nothing was actually swum. -->
<script lang="ts">
  import Sparkline from './Sparkline.svelte';
  import {
    buildLengthDisplayRows,
    lengthHrTrace,
    lengthZoneMix,
    lengthPaceSecPer100,
    lengthSwolf
  } from '../lib/swim-length-detail';
  import { ZONE_COLORS } from '../lib/hr-zones';
  import { formatClock } from '../lib/date-utils';
  import type { SwimLength } from '../lib/types';

  interface Props {
    lengths: SwimLength[];
    t: number[];
    hr: number[];
    hrZoneBoundaries: number[];
    poolLengthM: number;
    avgPaceSecPer100: number; // session average, for the pace-vs-average delta
    // Which length the effort tape's current scrub position falls inside -
    // highlights that tile, same convention as KmTiles' scrubLapIndex.
    scrubLengthIndex?: number | null;
  }

  let { lengths, t, hr, hrZoneBoundaries, poolLengthM, avgPaceSecPer100, scrubLengthIndex = null }: Props = $props();

  let rows = $derived(buildLengthDisplayRows(lengths));

  let hoveredIndex = $state<number | null>(null);

  function formatPaceBare(secPer100: number): string {
    const m = Math.floor(secPer100 / 60);
    const s = Math.round(secPer100 % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function deltaSec(secPer100: number): number {
    return Math.round(secPer100 - avgPaceSecPer100);
  }

  function formatDelta(sec: number): string {
    return `${sec >= 0 ? '+' : ''}${sec}s`;
  }

  // SwimLength (unlike Lap) carries no summary avgHR field - real average
  // is computed here from the same real per-second trace the sparkline
  // already plots, rather than a second, differently-sourced number.
  function avgHr(trace: number[]): number {
    return trace.length > 0 ? Math.round(trace.reduce((s, v) => s + v, 0) / trace.length) : 0;
  }

  // Accessibility: the zone-mix bar below conveys real time-in-zone shares
  // by colour and width alone - a real text equivalent for hover/screen
  // reader use, same convention KmTiles' own zone-mix bar now uses too.
  function mixTitle(mix: number[]): string {
    return mix
      .map((frac, z) => ({ z, frac }))
      .filter((m) => m.frac > 0)
      .map((m) => `Z${m.z + 1} ${Math.round(m.frac * 100)}%`)
      .join(' · ');
  }
</script>

<div class="km-tiles">
  {#each rows as row (row.key)}
    {#if row.kind === 'rest'}
      {@const restActive = scrubLengthIndex !== null && scrubLengthIndex >= row.firstIndex && scrubLengthIndex <= row.lastIndex}
      <div class="km-tile rest-tile" class:km-tile-active={restActive}>
        <span class="rest-tile-label mono">Rest</span>
        <span class="rest-tile-time mono">{formatClock(row.elapsedSec)}</span>
      </div>
    {:else}
      {@const l = row.length}
      {@const trace = lengthHrTrace(l, t, hr)}
      {@const mix = lengthZoneMix(l, t, hr, hrZoneBoundaries)}
      {@const paceSec = lengthPaceSecPer100(l, poolLengthM)}
      {@const swolf = lengthSwolf(l)}
      {@const active = hoveredIndex === l.index || scrubLengthIndex === l.index}
      <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
      <div
        class="km-tile"
        class:km-tile-active={active}
        role="button"
        tabindex="0"
        onmouseenter={() => (hoveredIndex = l.index)}
        onmouseleave={() => (hoveredIndex = null)}
        onfocus={() => (hoveredIndex = l.index)}
        onblur={() => (hoveredIndex = null)}
      >
        <div class="km-tile-head">
          <span class="km-tile-num mono">len {l.index + 1}</span>
          <span class="km-tile-pace mono">{paceSec !== null ? formatPaceBare(paceSec) : '—'}</span>
        </div>
        <div class="km-tile-spark">
          {#if trace.length > 1}
            <Sparkline data={trace} color="var(--alert)" height={30} />
          {/if}
        </div>
        <div class="km-tile-foot">
          <span class="km-tile-delta mono" class:km-tile-delta-fast={paceSec !== null && deltaSec(paceSec) < 0}>{paceSec !== null ? formatDelta(deltaSec(paceSec)) : '—'}</span>
          <span class="km-tile-hr mono">{trace.length > 0 ? `${avgHr(trace)} bpm` : '—'}</span>
        </div>
        {#if swolf !== null}
          <div class="km-tile-swolf mono">{swolf} swolf</div>
        {/if}
        {#if mix.length === 5}
          <div class="km-tile-mix" title={mixTitle(mix)}>
            {#each mix as frac, z (z)}
              {#if frac > 0}<div style="width: {frac * 100}%; background: {ZONE_COLORS[z]};"></div>{/if}
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  /* Same tile grid as KmTiles.svelte - kept visually identical rather than
     inventing a second look for the same "one piece of the activity" idea. */
  .km-tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(138px, 1fr));
    gap: var(--space-6);
  }
  .km-tile {
    background: var(--bg-well);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-sm);
    padding: var(--space-5) var(--space-5) var(--space-4);
    cursor: pointer;
  }
  .km-tile:hover,
  .km-tile:focus-visible {
    border-color: var(--ink-5);
  }
  .km-tile-active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .km-tile-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: var(--fs-base);
  }
  .km-tile-num {
    color: var(--ink-6);
  }
  .km-tile-pace {
    color: var(--ink-1);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-lg);
  }
  .km-tile-spark {
    height: 30px;
    margin: var(--space-3) 0 var(--space-3);
  }
  .km-tile-foot {
    display: flex;
    justify-content: space-between;
    font-size: var(--fs-sm);
    color: var(--ink-5);
  }
  .km-tile-delta-fast {
    color: var(--accent);
  }
  .km-tile-swolf {
    margin-top: var(--space-2);
    font-size: var(--fs-xs);
    color: var(--ink-6);
  }
  .km-tile-mix {
    display: flex;
    height: 4px;
    border-radius: 1px;
    overflow: hidden;
    margin-top: var(--space-4);
    background: var(--bg-app);
  }

  /* A rest length has nothing real to plot (no HR trace worth showing, no
     pace, no zone mix) - a plain muted placeholder instead of an empty
     version of the active tile's layout. Still not hover/focus-interactive
     (there's nothing to click into), but it does pick up the same
     km-tile-active scrub highlight as a real length tile when the scrub
     position falls inside its merged real [firstIndex, lastIndex] range -
     rest is still real time in the activity, worth showing where the
     current scrub position actually is. */
  .rest-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    color: var(--ink-6);
    border-style: dashed;
    cursor: default;
    min-height: 78px;
  }
  .rest-tile-label {
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
  }
  .rest-tile-time {
    font-size: var(--fs-base);
  }
</style>
