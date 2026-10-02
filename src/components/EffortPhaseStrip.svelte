<!-- EffortPhaseStrip.svelte - the Tape view's caption strip under the effort
     tape (bug-list.md): up to four real, derived phases (lib/effort-phases.ts),
     each box sized proportionally to how much of the real activity duration
     it actually covers, so the strip's own layout lines up under the tape's
     time axis above it. -->
<script lang="ts">
  import { EFFORT_PHASE_LABELS, type EffortPhase } from '../lib/effort-phases';
  import { formatPaceBare, formatDistance, type UnitSystem } from '../lib/units';

  interface Props {
    phases: EffortPhase[];
    totalDurationSec: number;
    unitSystem: UnitSystem;
  }

  let { phases, totalDurationSec, unitSystem }: Props = $props();

  function widthPct(p: EffortPhase): number {
    if (totalDurationSec <= 0) return 0;
    return ((p.endSec - p.startSec) / totalDurationSec) * 100;
  }

  function detailText(p: EffortPhase): string {
    switch (p.kind) {
      case 'warmup':
        return `HR ${Math.round(p.avgHR)} · pace ${formatPaceBare(p.avgPaceMinPerKm, unitSystem)}`;
      case 'steady': {
        const dist = p.distanceKm !== undefined ? formatDistance(p.distanceKm, unitSystem, 1) : '';
        const spread = p.paceStdDevSec !== undefined ? ` ±${Math.round(p.paceStdDevSec)}s` : '';
        return `${dist} at ${formatPaceBare(p.avgPaceMinPerKm, unitSystem)}${spread}`;
      }
      case 'drift': {
        const delta = p.deltaHR !== undefined ? `${p.deltaHR >= 0 ? '+' : ''}${Math.round(p.deltaHR)} bpm` : '';
        return `${delta}, pace ${p.paceTrend ?? 'flat'}`;
      }
      case 'surge':
        return `${formatPaceBare(p.avgPaceMinPerKm, unitSystem)}${p.maxHR ? ` · ${p.maxHR} max` : ''}`;
    }
  }
</script>

{#if phases.length > 0}
  <div class="phase-strip">
    {#each phases as phase, i (phase.kind + phase.startSec)}
      <div class="phase-box" class:phase-box-first={i === 0} style="flex: {Math.max(widthPct(phase), 4)}; min-width: 92px;">
        <span class="phase-label">{EFFORT_PHASE_LABELS[phase.kind]}</span>
        <span class="phase-detail mono">{detailText(phase)}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  /* A 1px gap between same-background boxes read as barely-there - each
     phase box now gets a real left divider (and the strip a real outer
     border), so a phase's own start/end is unambiguous at a glance, not
     just inferable from its text. */
  .phase-strip {
    display: flex;
    margin-top: var(--space-4);
    border: 1px solid var(--line-panel);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .phase-box {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-5);
    border-top: 2px solid var(--accent);
    border-left: 1px solid var(--line-panel);
    background: var(--bg-well);
    min-width: 0;
  }
  .phase-box-first {
    border-left: none;
  }
  .phase-label {
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--accent);
    white-space: normal;
    line-height: 1.3;
  }
  .phase-detail {
    font-size: var(--fs-xs);
    color: var(--ink-4);
    white-space: normal;
    line-height: 1.3;
  }
</style>
