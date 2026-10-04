<!-- TimeInZones.svelte - "time in heart-rate zone" breakdown, descending Z5->Z1 -->
<script lang="ts">
  import { ZONE_NAMES, ZONE_COLORS } from '../lib/hr-zones';

  interface Props {
    timeInZoneSec: number[];
    hrZoneBoundaries: number[];
  }

  let { timeInZoneSec, hrZoneBoundaries }: Props = $props();

  let total = $derived(timeInZoneSec.reduce((s, v) => s + v, 0));

  function formatDuration(sec: number): string {
    const min = Math.round(sec / 60);
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:00` : `${m}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  }

  // hrZoneBoundaries holds each zone's *floor* bpm (Z1..Z5), confirmed
  // against a real device's own zone config - Z1's floor is real (device-
  // configured, not "anything below"), and Z5 has no recorded ceiling.
  function zoneRange(i: number): string {
    if (hrZoneBoundaries.length !== 5) return '';
    if (i === 4) return `> ${hrZoneBoundaries[4]! - 1} bpm`;
    return `${hrZoneBoundaries[i]} – ${hrZoneBoundaries[i + 1]! - 1} bpm`;
  }
</script>

{#if timeInZoneSec.length === 5 && total > 0}
  <!-- One line per zone (bug-list.md): label, bar, duration and share all
       on the same row. The rows share one grid, so every bar starts and
       ends at the same x regardless of how long each zone's label is. -->
  <div class="zones-list">
    {#each [4, 3, 2, 1, 0] as i (i)}
      {@const sec = timeInZoneSec[i] ?? 0}
      {@const pct = (sec / total) * 100}
      <div class="zone-row">
        <span class="zone-num" style="color: {ZONE_COLORS[i]};">Z{i + 1}</span>
        <span class="zone-label">
          <span class="zone-name">{ZONE_NAMES[i]}</span>
          <span class="zone-range mono">{zoneRange(i)}</span>
        </span>
        <div class="zone-track">
          <div class="zone-fill" style="width: {pct}%; background: {ZONE_COLORS[i]};"></div>
        </div>
        <span class="zone-duration mono">{formatDuration(sec)}</span>
        <span class="zone-percent mono">{Math.round(pct)}%</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .zones-list {
    display: grid;
    grid-template-columns: 24px max-content minmax(48px, 1fr) max-content 30px;
    column-gap: var(--space-5);
    row-gap: var(--space-2);
    align-items: center;
  }
  .zone-row {
    display: contents;
  }
  .zone-num {
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xs);
    text-align: right;
  }
  .zone-label {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    white-space: nowrap;
  }
  .zone-name {
    font-family: var(--font-sans);
    font-weight: var(--fw-medium);
    font-size: var(--fs-sm);
    color: var(--ink-2);
  }
  .zone-range {
    font-size: var(--fs-xs);
    color: var(--ink-5);
  }
  .zone-duration {
    font-size: var(--fs-base);
    color: var(--ink-1);
    text-align: right;
  }
  .zone-percent {
    font-size: var(--fs-xs);
    color: var(--ink-5);
    text-align: right;
  }
  .zone-track {
    height: 9px;
    border-radius: 1px;
    background: var(--bg-well);
    overflow: hidden;
  }
  .zone-fill {
    height: 100%;
  }

  /* Too narrow for the bpm ranges on the same line - drop them rather
     than squeezing the bars (they're still in the zone names' order). */
  @media (max-width: 520px) {
    .zone-range {
      display: none;
    }
  }
</style>
