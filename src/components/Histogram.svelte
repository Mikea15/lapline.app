<!-- Histogram.svelte - generic distribution histogram, shared by the Trends
     "Pace histogram", "Distance histogram" and "Avg HR histogram" panels.
     Bin count adapts to the sample size (sqrt rule, clamped) rather than a
     fixed count - a handful of points no longer gets spread thin across many
     empty bins, and a big sample gets finer resolution than a small one. -->
<script lang="ts">
  import { touchHover } from '../lib/touch-hover';
  interface Props {
    values: number[];
    formatValue: (v: number) => string;
    emptyText?: string;
    /** Plural noun for the "n = " footer, e.g. "splits", "activities". */
    unitLabel?: string;
  }

  let { values, formatValue, emptyText = 'Not enough data yet.', unitLabel = 'samples' }: Props = $props();

  const MIN_BINS = 12;
  const MAX_BINS = 100;
  // Bars only - the SVG stretches to its box (preserveAspectRatio="none",
  // fine for rects and a non-scaling-stroke line) and the axis labels are
  // HTML below it, so a narrow phone panel neither squashes the plot to a
  // sliver nor lets scaled-up label text spill over the bars.
  const VB_W = 1000;
  const PLOT_H = 196;

  let sorted = $derived(values.slice().sort((a, b) => a - b));
  let n = $derived(sorted.length);
  // sqrt(n) (Sturges-ish) scaled up so a real training history actually
  // reaches a finer resolution - the plain sqrt rule tops out well below
  // MAX_BINS for the sample sizes this app typically sees (dozens to a few
  // hundred splits/activities), leaving most histograms sitting at the
  // MIN_BINS floor regardless of how much data there actually is.
  let numBins = $derived(Math.max(MIN_BINS, Math.min(MAX_BINS, Math.round(Math.sqrt(n) * 4.5))));

  let median = $derived(n > 0 ? sorted[Math.floor(n / 2)]! : 0);
  let p10 = $derived(n > 0 ? sorted[Math.floor(n * 0.1)]! : 0);
  let p90 = $derived(n > 0 ? sorted[Math.min(n - 1, Math.floor(n * 0.9))]! : 0);

  // Padding is a fraction of the observed range rather than a fixed value,
  // so it scales sensibly whether the values are minutes/km or bpm - falls
  // back to a small absolute pad when every value is identical (range 0).
  // Clamped at 0: every value this renders today (pace, distance, duration,
  // heart rate) is a non-negative real-world quantity, so padding below the
  // smallest real sample past zero - which the flat 6%-of-range padding did
  // whenever that sample sat close to zero - produced an impossible
  // negative axis label instead of just a slightly tighter left margin.
  let domainMin = $derived.by(() => {
    if (n === 0) return 0;
    const range = sorted[n - 1]! - sorted[0]!;
    return Math.max(0, sorted[0]! - (range > 0 ? range * 0.06 : Math.abs(sorted[0]!) * 0.05 || 1));
  });
  let domainMax = $derived.by(() => {
    if (n === 0) return 1;
    const range = sorted[n - 1]! - sorted[0]!;
    return sorted[n - 1]! + (range > 0 ? range * 0.06 : Math.abs(sorted[n - 1]!) * 0.05 || 1);
  });
  let binWidth = $derived((domainMax - domainMin || 1) / numBins);

  let bins = $derived.by(() => {
    const counts = new Array(numBins).fill(0) as number[];
    for (const v of values) {
      let idx = Math.floor((v - domainMin) / binWidth);
      idx = Math.max(0, Math.min(numBins - 1, idx));
      counts[idx]!++;
    }
    return counts;
  });

  let maxCount = $derived(Math.max(1, ...bins));
  let modalBinIndex = $derived(bins.indexOf(maxCount));

  let slotW = $derived(VB_W / numBins);
  let medianX = $derived(((median - domainMin) / (domainMax - domainMin || 1)) * VB_W);

  let hoverIndex = $state<number | null>(null);
  let hoverBin = $derived.by(() => {
    if (hoverIndex === null) return null;
    const count = bins[hoverIndex]!;
    const h = (count / maxCount) * PLOT_H;
    const lo = domainMin + hoverIndex * binWidth;
    return { count, h, lo, hi: lo + binWidth };
  });
</script>

<div class="hist-wrap">
  {#if n === 0}
    <div class="empty-state" style="padding: var(--space-10) var(--space-4);">{emptyText}</div>
  {:else}
    <svg use:touchHover viewBox="0 0 {VB_W} {PLOT_H}" preserveAspectRatio="none" class="hist-svg" role="img" aria-label="Distribution histogram">
      {#each bins as count, i (i)}
        {@const h = (count / maxCount) * PLOT_H}
        {@const inModalBand = Math.abs(i - modalBinIndex) <= 1}
        <rect x={i * slotW + 2} y={PLOT_H - h} width={slotW - 4} height={h} fill={inModalBand ? 'var(--accent)' : 'var(--neutral-bar-alt)'} />
      {/each}
      <line x1={medianX} y1="0" x2={medianX} y2={PLOT_H} stroke="var(--accent)" stroke-width="1.4" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />

      <!-- Full-height transparent hit targets, separate from the visual bars
           above - a short/empty bin's own rect can be too thin (or zero
           height) to reliably hover, so hovering anywhere in that bin's
           column still picks it up. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      {#each bins as _, i (i)}
        <rect x={i * slotW} y="0" width={slotW} height={PLOT_H} fill="transparent" onmouseenter={() => (hoverIndex = i)} onmouseleave={() => (hoverIndex = null)} />
      {/each}
    </svg>
    {#if hoverBin}
      <div class="chart-tooltip" style="left: {((hoverIndex! + 0.5) * slotW / VB_W) * 100}%; top: {((PLOT_H - hoverBin.h) / PLOT_H) * 100}%;">
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label">{formatValue(hoverBin.lo)}–{formatValue(hoverBin.hi)}</span>
          <span class="chart-tooltip-value">{hoverBin.count} {unitLabel}</span>
        </div>
      </div>
    {/if}
    <div class="hist-axis mono">
      <span>{formatValue(domainMin)}</span>
      <span>{formatValue(domainMax)}</span>
    </div>
    <div class="hist-footer mono">
      <span>{n} {unitLabel}</span>
      <span>middle 80%: {formatValue(p10)}–{formatValue(p90)}</span>
    </div>
  {/if}
</div>

<style>
  .hist-wrap {
    width: 100%;
    position: relative;
  }
  .hist-svg {
    width: 100%;
    height: auto;
    aspect-ratio: 1000 / 196;
    min-height: 110px;
    display: block;
  }
  .hist-axis {
    display: flex;
    justify-content: space-between;
    margin-top: var(--space-2);
    font-size: var(--fs-sm);
    color: var(--ink-5);
  }
  .hist-footer {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--space-7);
    margin-top: var(--space-4);
    font-size: var(--fs-xs);
    color: var(--ink-5);
  }
</style>
