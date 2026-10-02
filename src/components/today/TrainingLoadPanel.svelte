<!-- TrainingLoadPanel.svelte - Today's Training load panel: the current
     acute:chronic ratio with where it sits on the detrain / productive /
     caution / risk strip and what to do about it, over the weekly load
     chart and its per-week ratio strip (TrainingLoadChart.svelte). -->
<script lang="ts">
  import InfoLabel from '../InfoLabel.svelte';
  import TrainingLoadChart from '../TrainingLoadChart.svelte';
  import type { Activity } from '../../lib/types';
  import { loadBand, LOAD_BAND_COLOR, LOAD_BAND_LABEL, type AcuteChronic, type LoadBand } from '../../lib/training-load';

  interface Props {
    activities: Activity[];
    ratio: AcuteChronic;
    weeksShown: number;
  }

  let { activities, ratio, weeksShown }: Props = $props();

  // The strip's bands, with how wide each is drawn and the ratio range it
  // covers (the last is open-ended, drawn up to 2.0).
  // `range` and `meaning` explain each band in the key under the chart.
  const BANDS: { band: LoadBand; label: string; from: number; to: number; weight: number; range: string; meaning: string }[] = [
    { band: 'detrain', label: LOAD_BAND_LABEL.detrain, from: 0, to: 0.8, weight: 1, range: 'below 0.8', meaning: "Training less than you're used to. Fitness slowly drifts down." },
    { band: 'productive', label: LOAD_BAND_LABEL.productive, from: 0.8, to: 1.3, weight: 1.6, range: '0.8–1.3', meaning: 'The sweet spot. Enough to build fitness without a spike.' },
    { band: 'caution', label: LOAD_BAND_LABEL.caution, from: 1.3, to: 1.5, weight: 0.8, range: '1.3–1.5', meaning: 'Ramping up quicker than usual.' },
    { band: 'risk', label: LOAD_BAND_LABEL.risk, from: 1.5, to: 2, weight: 0.8, range: 'above 1.5', meaning: 'A spike well above your baseline, where injury risk rises.' }
  ];
  const TOTAL_WEIGHT = BANDS.reduce((s, b) => s + b.weight, 0);

  let hasRatio = $derived(ratio.chronic42d > 0);
  let band = $derived(hasRatio ? loadBand(ratio.ratio) : null);
  let color = $derived(band ? LOAD_BAND_COLOR[band] : 'var(--ink-5)');

  let markerPct = $derived.by(() => {
    if (!hasRatio) return null;
    const r = Math.min(2, Math.max(0, ratio.ratio));
    let before = 0;
    for (const b of BANDS) {
      if (r <= b.to || b === BANDS[BANDS.length - 1]) return ((before + ((r - b.from) / (b.to - b.from)) * b.weight) / TOTAL_WEIGHT) * 100;
      before += b.weight;
    }
    return 100;
  });

  let advice = $derived.by(() => {
    if (!hasRatio) return 'Not enough training history yet for a ratio.';
    const r = ratio.ratio;
    if (band === 'detrain') return 'Below your baseline — fitness is drifting. Build back up gradually.';
    if (band === 'productive') return r >= 1.2 ? 'Top of the productive band — hold next week flat.' : r < 1 ? 'Low in the productive band — room to build next week.' : 'In the productive band — steady progression.';
    if (band === 'caution') return 'Above the productive band — ease off next week.';
    return 'A spike well above your baseline — back off to cut injury risk.';
  });
</script>

<div class="tl">
  <div class="tl-head">
    <div class="tl-title">
      <InfoLabel class="panel-label" text="Training load" tip="A score for how much you trained: hours of running, cycling and swimming, weighted by sport. The line is your 6-week weekly average (chronic load); the strip under the bars is each week's acute:chronic ratio." />
      <p class="panel-prose">Weekly load against your 42-day chronic baseline. The strip below is the ratio between them.</p>
    </div>
    <div class="tl-ratio-value">
      <span class="num mono" style="color: {color};">{hasRatio ? ratio.ratio.toFixed(2) : '—'}</span>
      <InfoLabel
        class="tl-ratio-label"
        text="Acute : chronic"
        tip="Acute (7-day) load divided by chronic (42-day) load: the standard ratio for flagging under- or over-training. 0.8-1.3 is the productive band; above 1.5 is the risk band."
        openBelow
      />
    </div>
    <div class="tl-bands">
      <div class="strip">
        {#each BANDS as b (b.band)}
          <span class="seg" class:current={b.band === band} style="flex: {b.weight}; background: {LOAD_BAND_COLOR[b.band]};"></span>
        {/each}
        {#if markerPct !== null}
          <span class="thumb" style="left: {markerPct}%;"></span>
        {/if}
      </div>
      <div class="names">
        {#each BANDS as b (b.band)}
          <span class="name" style="flex: {b.weight};{b.band === band ? ` color: ${LOAD_BAND_COLOR[b.band]};` : ''}">{b.label}</span>
        {/each}
      </div>
      <p class="advice mono" style="color: {color};">{advice}</p>
    </div>
  </div>

  <TrainingLoadChart {activities} {weeksShown} />

  <div class="key">
    {#each BANDS as b (b.band)}
      <div class="key-item">
        <div class="key-head mono">
          <span class="key-swatch" style="background: {LOAD_BAND_COLOR[b.band]};"></span>
          <span class="key-name" style="color: {LOAD_BAND_COLOR[b.band]};">{b.label}</span>
          <span class="key-range">{b.range}</span>
        </div>
        <p class="key-meaning">{b.meaning}</p>
      </div>
    {/each}
  </div>

  <p class="tl-note mono">Your workout files don't include sleep or HRV, so this ratio is the closest guide to recovery here.</p>
</div>

<style>
  .tl {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  /* Title, ratio and band strip on one row; the ratio sits well clear of
     the strip so the strip has room. Narrow panels stack them. */
  .tl-head {
    display: grid;
    grid-template-columns: minmax(200px, 1fr) auto minmax(260px, 420px);
    align-items: start;
    column-gap: calc(var(--space-10) * 1.5);
    row-gap: var(--space-7);
  }
  .tl-ratio-value {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }
  .num {
    font-size: var(--fs-3xl);
    letter-spacing: var(--tracking-tight);
    line-height: 1;
  }
  :global(.tl-ratio-label) {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-6);
  }
  .tl-bands {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .strip {
    position: relative;
    display: flex;
    gap: var(--space-1);
    height: 10px;
  }
  .seg {
    border-radius: 1px;
    opacity: 0.3;
  }
  .seg.current {
    opacity: 1;
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
    min-width: 0;
    text-align: center;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-6);
    white-space: nowrap;
  }
  .advice {
    margin: var(--space-2) 0 0;
    font-size: var(--fs-xs);
    line-height: 1.4;
  }
  .key {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-6) var(--space-8);
  }
  .key-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .key-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    font-size: var(--fs-xs);
  }
  .key-swatch {
    width: 8px;
    height: 8px;
    border-radius: 1px;
  }
  .key-name {
    font-weight: var(--fw-semibold);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
  }
  .key-range {
    color: var(--ink-5);
    white-space: nowrap;
  }
  .key-meaning {
    margin: 0;
    font-size: var(--fs-sm);
    line-height: 1.4;
    color: var(--ink-4);
  }
  @container (max-width: 720px) {
    .tl-head {
      grid-template-columns: auto minmax(0, 1fr);
      column-gap: var(--space-9);
    }
    .tl-title {
      grid-column: 1 / -1;
    }
    .key {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  /* A phone: the strip needs the full width for its four names. */
  @container (max-width: 480px) {
    .tl-head {
      grid-template-columns: minmax(0, 1fr);
    }
    .tl-ratio-value {
      align-items: flex-start;
    }
  }
  .tl-note {
    margin: 0;
    padding-top: var(--space-6);
    border-top: 1px solid var(--line-soft);
    font-size: var(--fs-xs);
    color: var(--ink-6);
  }
</style>
