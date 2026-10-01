<!-- Vo2MaxCard.svelte - Today's VO2max estimate, rated poor..superior on
     the Cooper Institute norms for the user's age and sex (Settings >
     Training), with where it was 4 weeks ago marked on the same scale. With
     no age/sex set there's no rating, just the figure and its trend. -->
<script lang="ts">
  import KpiCard from './KpiCard.svelte';
  import Skeleton from '../Skeleton.svelte';
  import { settingsStore } from '../../lib/stores.svelte';
  import { vo2BandBounds, vo2Band, vo2ScalePosition, VO2_BANDS, type Vo2Band } from '../../lib/today-kpis';

  interface Props {
    value: number | null;
    /** The estimate 4 weeks ago, for the trend marker and chip. */
    prior: number | null;
    loading: boolean;
  }

  let { value, prior, loading }: Props = $props();

  const BAND: Record<Vo2Band, { name: string; short: string; color: string }> = {
    poor: { name: 'Poor', short: 'Poor', color: 'var(--alert)' },
    fair: { name: 'Fair', short: 'Fair', color: 'var(--caution)' },
    good: { name: 'Good', short: 'Good', color: 'var(--positive)' },
    excellent: { name: 'Excellent', short: 'Excel.', color: 'var(--accent)' },
    superior: { name: 'Superior', short: 'Super.', color: 'var(--zone-1)' }
  };

  let age = $derived(settingsStore.getAge());
  let sex = $derived(settingsStore.getSex());
  let bounds = $derived(age !== null && sex !== null ? vo2BandBounds(age, sex) : null);
  let band = $derived(bounds && value !== null ? vo2Band(value, bounds) : null);
  let nowPos = $derived(bounds && value !== null ? vo2ScalePosition(value, bounds) * 100 : null);
  let priorPos = $derived(bounds && prior !== null ? vo2ScalePosition(prior, bounds) * 100 : null);
  // Two labels this close would overlap; "now" wins.
  let showPriorLabel = $derived(priorPos !== null && nowPos !== null && Math.abs(priorPos - nowPos) > 14);

  let deltaPct = $derived(value !== null && prior !== null && prior > 0 ? ((value - prior) / prior) * 100 : null);
  let chip = $derived(
    deltaPct === null || Math.abs(deltaPct) < 0.05
      ? null
      : { text: `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`, tone: deltaPct > 0 ? ('positive' as const) : ('caution' as const) }
  );
  let caption = $derived.by(() => {
    if (value === null) return 'needs a hard run effort';
    if (!bounds || !band) return deltaPct === null ? 'add birth year + sex in Settings' : 'in 4w · no rating yet';
    const i = VO2_BANDS.indexOf(band);
    const next = i < 4 ? `${(bounds[i]! - value).toFixed(1)} to ${BAND[VO2_BANDS[i + 1]!].name.toLowerCase()}` : 'top band for your age';
    return deltaPct === null ? next : `in 4w · ${next}`;
  });
</script>

<KpiCard
  label="VO₂ max est."
  tip="Estimated aerobic fitness (ml of oxygen per kg of body weight per minute), from your best recent run effort. Rated against Cooper Institute norms for your age and sex, set in Settings > Training."
  edge="var(--accent)"
  badge={band ? { text: BAND[band].name, color: BAND[band].color } : null}
  chip={loading ? null : chip}
  caption={loading ? '' : caption}
>
  {#if loading}
    <div class="kpi-value-row"><Skeleton width="96px" height="32px" /></div>
    <Skeleton width="100%" height="34px" />
  {:else}
    <div class="kpi-value-row">
      <span class="kpi-value" style="color: var(--accent);">{value ?? '—'}</span>
      <span class="kpi-unit">ml/kg/min</span>
    </div>
    {#if bounds && nowPos !== null}
      <div class="scale">
        <div class="marks">
          {#if priorPos !== null && showPriorLabel}
            <span class="mark-label mono" style="left: {priorPos}%;">{prior}</span>
          {/if}
          <span class="mark-label now mono" style="left: {nowPos}%;">now</span>
        </div>
        <div class="track">
          {#each VO2_BANDS as b (b)}
            <span class="band" class:current={b === band} style="background: {BAND[b].color};"></span>
          {/each}
          {#if priorPos !== null}
            <span class="trail" style="left: {Math.min(priorPos, nowPos)}%; width: {Math.abs(nowPos - priorPos)}%;"></span>
            <span class="prior-tick" style="left: {priorPos}%;"></span>
          {/if}
          <span class="thumb" style="left: {nowPos}%;"></span>
        </div>
        <div class="names">
          {#each VO2_BANDS as b (b)}
            <span class="name mono" class:current={b === band} style={b === band ? `color: ${BAND[b].color};` : ''}>{BAND[b].short}</span>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</KpiCard>

<style>
  .scale {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .marks {
    position: relative;
    height: 14px;
  }
  .mark-label {
    position: absolute;
    transform: translateX(-50%);
    font-size: var(--fs-xs);
    color: var(--ink-5);
    white-space: nowrap;
  }
  .mark-label.now {
    color: var(--accent);
    font-weight: var(--fw-semibold);
  }
  .track {
    position: relative;
    display: flex;
    gap: var(--space-1);
    height: 8px;
  }
  .band {
    flex: 1;
    border-radius: 1px;
    opacity: 0.3;
  }
  .band.current {
    opacity: 1;
  }
  .trail {
    position: absolute;
    top: 50%;
    height: 2px;
    margin-top: -1px;
    background: var(--ink-3);
    opacity: 0.6;
  }
  .prior-tick {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    margin-left: -1px;
    background: var(--ink-4);
  }
  .thumb {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 8px;
    margin-left: -4px;
    border: 2px solid var(--ink-1);
    border-radius: 2px;
    background: var(--bg-panel);
  }
  .names {
    display: flex;
    gap: var(--space-1);
  }
  .name {
    flex: 1;
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-6);
    text-align: center;
  }
  .name:first-child {
    text-align: left;
  }
  .name:last-child {
    text-align: right;
  }
</style>
