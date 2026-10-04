<!-- RecoveryCard.svelte - Today's recovery, from the only recovery data a
     workout FIT file carries: Garmin's on-device recovery-time estimate
     (lib/recovery.ts), plus the acute:chronic load ratio. The outer ring
     fills as the estimate counts down; the inner arc is the ratio on a 0-2
     scale. No HRV or wellness data - workout files don't have it. -->
<script lang="ts">
  import KpiCard from './KpiCard.svelte';
  import type { RecoveryStatus } from '../../lib/recovery';
  import { LOAD_BAND_LABEL, type AcuteChronic } from '../../lib/training-load';
  import { formatDateShort } from '../../lib/date-utils';

  interface Props {
    recovery: RecoveryStatus;
    ratio: AcuteChronic;
  }

  let { recovery, ratio }: Props = $props();

  let hasData = $derived(recovery.hoursRemaining !== null);
  let ready = $derived(recovery.hoursRemaining === 0);
  let ink = $derived(!hasData ? 'var(--ink-5)' : ready ? 'var(--positive-ink)' : 'var(--caution-ink)');
  let color = $derived(!hasData ? 'var(--ink-5)' : ready ? 'var(--positive)' : 'var(--caution)');
  let progress = $derived(
    !hasData ? 0 : ready || !recovery.estimateHours ? 1 : Math.max(0, Math.min(1, 1 - recovery.hoursRemaining! / recovery.estimateHours))
  );
  let ratioFrac = $derived(Math.max(0, Math.min(1, ratio.ratio / 2)));

  // Two concentric rings, drawn as stroke-dasharray arcs from 12 o'clock.
  const OUTER = 26;
  const INNER = 17;
  const arc = (r: number, frac: number) => `${(2 * Math.PI * r * frac).toFixed(2)} ${(2 * Math.PI * r).toFixed(2)}`;
</script>

<KpiCard
  label="Recovery"
  tip="Your watch's recovery-time estimate, counting down from your last hard session (outer ring); the inner arc is your acute:chronic ratio. It isn't a readiness score: workout files don't include sleep or HRV."
  edge={color}
  meta={recovery.sourceDate ? `since ${formatDateShort(recovery.sourceDate)}` : ''}
  chip={hasData ? { text: `${recovery.hoursRemaining} h`, tone: ready ? 'positive' : 'caution' } : null}
  caption={!hasData ? 'import a run from a Garmin watch' : ready ? 'remaining · train as planned' : 'remaining · keep it easy'}
>
  <div class="row">
    <svg viewBox="0 0 64 64" class="ring" aria-hidden="true">
      <circle cx="32" cy="32" r={OUTER} class="track" stroke-width="5" />
      {#if progress > 0}
        <circle cx="32" cy="32" r={OUTER} class="arc" stroke-width="5" style="stroke: {color};" stroke-dasharray={arc(OUTER, progress)} />
      {/if}
      <circle cx="32" cy="32" r={INNER} class="track" stroke-width="3" />
      {#if ratio.ratio > 0}
        <circle cx="32" cy="32" r={INNER} class="arc" stroke-width="3" style="stroke: var(--accent);" stroke-dasharray={arc(INNER, ratioFrac)} />
      {/if}
    </svg>
    <div class="text">
      <span class="headline" style="color: {ink};">{!hasData ? '—' : ready ? 'Ready' : 'Recovering'}</span>
      {#if hasData}
        <span class="line mono">{recovery.estimateHours} h estimate · {formatDateShort(recovery.sourceDate!)}</span>
      {:else}
        <span class="line mono">no recovery estimate yet</span>
      {/if}
      {#if ratio.ratio > 0}
        <span class="line mono"><b>load ratio {ratio.ratio.toFixed(2)}</b> · {LOAD_BAND_LABEL[ratio.band].toLowerCase()}</span>
      {/if}
    </div>
  </div>
</KpiCard>

<style>
  .row {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-7);
  }
  .ring {
    flex: none;
    width: 56px;
    height: 56px;
    transform: rotate(-90deg);
  }
  circle {
    fill: none;
  }
  .track {
    stroke: var(--bg-well);
  }
  .arc {
    stroke-linecap: round;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .headline {
    font-size: var(--fs-2xl);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--tracking-tight);
    line-height: 1.1;
  }
  .line {
    font-size: var(--fs-xs);
    color: var(--ink-5);
  }
  .line b {
    color: var(--accent-ink);
    font-weight: var(--fw-semibold);
  }
</style>
