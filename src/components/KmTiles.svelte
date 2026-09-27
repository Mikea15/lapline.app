<!-- KmTiles.svelte - Tape view's "kilometre by kilometre" tile grid
     (bug-list.md), replacing the running Splits table in this view: one
     tile per real device lap, each with its own real HR-trace sparkline,
     pace-vs-average delta, and HR-zone time mix, instead of a plain table
     row. Two-way hover-linked with the route/effort-tape scrub cursor via
     the same hoveredLapIndex convention RouteMap already uses. -->
<script lang="ts">
  import Sparkline from './Sparkline.svelte';
  import { lapHrTrace, lapZoneMix } from '../lib/lap-detail';
  import { ZONE_COLORS } from '../lib/hr-zones';
  import { formatPaceBare, formatSpeedBare, paceUnit, speedUnit, toDisplaySpeed, type UnitSystem } from '../lib/units';
  import type { Lap } from '../lib/types';

  interface Props {
    laps: Lap[];
    t: number[];
    hr: number[];
    hrZoneBoundaries: number[];
    avgPaceMinPerKm: number;
    unitSystem: UnitSystem;
    hoveredLapIndex?: number | null;
    onHoverLap?: (index: number | null) => void;
    // Which lap the effort tape's current scrub position falls inside -
    // highlights that tile the same way hover does, so scrubbing the tape
    // shows which kilometre it was without needing the pointer over the
    // tile grid at all.
    scrubLapIndex?: number | null;
    // Cycling: show each tile as speed (km/h, higher = faster), matching
    // the hero/ledger, which already correctly show cycling as speed
    // rather than running-style min/km pace - per your call on the
    // logged "per-sport visualization ideas" bug. `avgPaceMinPerKm` still
    // carries the same underlying "time per km" number either way; only
    // the display (and the delta's sign convention - higher speed is
    // faster, unlike lower pace) changes.
    showSpeed?: boolean;
  }

  let {
    laps,
    t,
    hr,
    hrZoneBoundaries,
    avgPaceMinPerKm,
    unitSystem,
    hoveredLapIndex = null,
    onHoverLap,
    scrubLapIndex = null,
    showSpeed = false
  }: Props = $props();

  const MIN_MEANINGFUL_LAP_M = 200; // excludes a trailing partial lap (e.g. a run stopped mid-km) from the pace-vs-average delta

  function speedKmh(paceMinPerKm: number): number {
    return paceMinPerKm > 0 ? 60 / paceMinPerKm : 0;
  }

  // Pace: negative seconds/km means faster. Speed: positive km/h means
  // faster - opposite sign conventions, so both return an already-signed
  // "is this faster than average" delta rather than leaking the raw units
  // into the template.
  function delta(lap: Lap): { value: number; isFast: boolean; label: string } | null {
    if (lap.distanceM < MIN_MEANINGFUL_LAP_M || lap.avgPaceMinPerKm <= 0 || avgPaceMinPerKm <= 0) return null;
    if (showSpeed) {
      const dKmh = speedKmh(lap.avgPaceMinPerKm) - speedKmh(avgPaceMinPerKm);
      const d = toDisplaySpeed(dKmh, unitSystem);
      return { value: d, isFast: d > 0, label: `${d >= 0 ? '+' : ''}${d.toFixed(1)} ${speedUnit(unitSystem)}` };
    }
    const sec = Math.round((lap.avgPaceMinPerKm - avgPaceMinPerKm) * 60);
    return { value: sec, isFast: sec < 0, label: `${sec >= 0 ? '+' : ''}${sec}s` };
  }

  // Accessibility: the zone-mix bar below conveys real time-in-zone shares
  // by colour and width alone - a real text equivalent for hover/screen
  // reader use, same convention ActivityLedger's own zone-mix bar already
  // uses for its tooltip.
  function mixTitle(mix: number[]): string {
    return mix
      .map((frac, z) => ({ z, frac }))
      .filter((m) => m.frac > 0)
      .map((m) => `Z${m.z + 1} ${Math.round(m.frac * 100)}%`)
      .join(' · ');
  }
</script>

<div class="km-tiles">
  {#each laps as lap, i (lap.index)}
    {@const trace = lapHrTrace(lap, t, hr)}
    {@const mix = lapZoneMix(lap, t, hr, hrZoneBoundaries)}
    {@const d = delta(lap)}
    {@const meaningful = lap.distanceM >= MIN_MEANINGFUL_LAP_M}
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div
      class="km-tile"
      class:km-tile-active={hoveredLapIndex === lap.index || scrubLapIndex === lap.index}
      role="button"
      tabindex="0"
      onmouseenter={() => onHoverLap?.(lap.index)}
      onmouseleave={() => onHoverLap?.(null)}
      onfocus={() => onHoverLap?.(lap.index)}
      onblur={() => onHoverLap?.(null)}
    >
      <div class="km-tile-head">
        <span class="km-tile-num mono">Km {i + 1}</span>
        <span class="km-tile-pace mono"
          >{meaningful && lap.avgPaceMinPerKm > 0
            ? showSpeed
              ? formatSpeedBare(speedKmh(lap.avgPaceMinPerKm), unitSystem)
              : formatPaceBare(lap.avgPaceMinPerKm, unitSystem)
            : '—'} {showSpeed ? speedUnit(unitSystem) : paceUnit(unitSystem)}</span
        >
      </div>
      <div class="km-tile-spark">
        {#if trace.length > 1}
          <Sparkline data={trace} color="var(--alert)" height={30} />
        {/if}
      </div>
      <div class="km-tile-foot">
        <span class="km-tile-delta mono" class:km-tile-delta-fast={d !== null && d.isFast}>{d !== null ? d.label : '—'}</span>
        <span class="km-tile-hr mono">{lap.avgHR > 0 ? `${lap.avgHR} bpm` : '—'}</span>
      </div>
      {#if mix.length === 5}
        <div class="km-tile-mix" title={mixTitle(mix)}>
          {#each mix as frac, z (z)}
            {#if frac > 0}<div style="width: {frac * 100}%; background: {ZONE_COLORS[z]};"></div>{/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
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
  .km-tile-mix {
    display: flex;
    height: 4px;
    border-radius: 1px;
    overflow: hidden;
    margin-top: var(--space-4);
    background: var(--bg-app);
  }
</style>
