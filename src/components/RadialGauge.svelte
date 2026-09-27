<!-- RadialGauge.svelte - a compact circular progress gauge for a bounded
     0..max metric (e.g. Garmin/Firstbeat's 0-5 Training Effect scale),
     reused wherever this app wants that "fancy rotary progress bar" look
     instead of a plain number cell. Pure SVG, no chart lib. -->
<script lang="ts">
  interface Props {
    value: number;
    max?: number;
    label: string; // e.g. "Aerobic"
    valueLabel: string; // pre-formatted big text, e.g. "4.8"
    sublabel?: string; // e.g. a qualitative label like "highly improving"
    color?: string;
  }

  let { value, max = 5, label, valueLabel, sublabel, color = 'var(--accent)' }: Props = $props();

  const SIZE = 100;
  const STROKE = 8;
  const R = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * R;

  let frac = $derived(max > 0 ? Math.max(0, Math.min(1, value / max)) : 0);
  let dashOffset = $derived(CIRCUMFERENCE * (1 - frac));
</script>

<div class="radial-gauge">
  <svg viewBox="0 0 {SIZE} {SIZE}" class="radial-gauge-svg" role="img" aria-label="{label}: {valueLabel} of {max}{sublabel ? `, ${sublabel}` : ''}">
    <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--line-panel)" stroke-width={STROKE} />
    <circle
      cx={SIZE / 2}
      cy={SIZE / 2}
      r={R}
      fill="none"
      stroke={color}
      stroke-width={STROKE}
      stroke-linecap="round"
      stroke-dasharray={CIRCUMFERENCE}
      stroke-dashoffset={dashOffset}
      transform="rotate(-90 {SIZE / 2} {SIZE / 2})"
    />
    <text x="50%" y="47%" text-anchor="middle" dominant-baseline="middle" class="radial-gauge-value">{valueLabel}</text>
    <text x="50%" y="66%" text-anchor="middle" dominant-baseline="middle" class="radial-gauge-label">{label}</text>
  </svg>
  {#if sublabel}
    <div class="radial-gauge-sublabel">{sublabel}</div>
  {/if}
</div>

<style>
  .radial-gauge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
  .radial-gauge-svg {
    width: 92px;
    height: 92px;
  }
  .radial-gauge-value {
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xl);
    fill: var(--ink-1);
  }
  .radial-gauge-label {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    fill: var(--ink-6);
  }
  .radial-gauge-sublabel {
    font-size: var(--fs-xs);
    color: var(--ink-4);
    text-align: center;
  }
</style>
