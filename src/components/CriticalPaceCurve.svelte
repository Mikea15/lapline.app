<!-- CriticalPaceCurve.svelte - best sustained pace per duration, the selected range vs the one before it. -->
<script lang="ts">
  import { touchHover } from '../lib/touch-hover';
  import type { CriticalPaceCurves } from '../lib/critical-pace';
  import { formatPace, type UnitSystem } from '../lib/units';
  import { chartLabelFontSize, chartViewBoxHeight } from '../lib/chart-scale';

  interface Props {
    curves: CriticalPaceCurves;
    unitSystem: UnitSystem;
    /** The range filter's label ("12w", "1y", "All", or a formatted
        custom date range) - names the two compared windows concretely
        ("current 12w" / "prev 12w") instead of the vaguer "this range". */
    rangeLabel: string;
  }

  let { curves, unitSystem, rangeLabel }: Props = $props();

  let containerWidth = $state(0);

  const X_POS = [0, 150, 300, 450, 600, 780, 1000];
  // Every label carries its own unit (not just the first/last) so none of
  // them read as ambiguous on their own.
  const LABELS = ['1m', '5m', '10m', '20m', '30m', '45m', '60m'];
  const VB_W = 1000;
  const M_TOP = 8;

  let labelFontSize = $derived(chartLabelFontSize(VB_W, containerWidth));
  let VB_H = $derived(chartViewBoxHeight(VB_W, 196, containerWidth));
  let M_BOTTOM = $derived(Math.max(20, labelFontSize + 6));
  let PLOT_H = $derived(VB_H - M_TOP - M_BOTTOM);

  // Duration labels that fit without touching: the first and last always,
  // then any in between with a label's width (plus a gap) clear of its
  // neighbours - on a phone 1m/5m/10m sit too close together for all three.
  let visibleLabels = $derived.by(() => {
    const w = (i: number) => LABELS[i]!.length * labelFontSize * 0.6;
    // Left edge / right edge of label i given its anchor (start, middle, end).
    const left = (i: number) => (i === 0 ? X_POS[0]! : i === LABELS.length - 1 ? X_POS[i]! - w(i) : X_POS[i]! - w(i) / 2);
    const right = (i: number) => left(i) + w(i);
    const gap = labelFontSize * 0.8;
    const last = LABELS.length - 1;
    const keep = [0];
    for (let i = 1; i < last; i++) {
      if (left(i) >= right(keep[keep.length - 1]!) + gap && right(i) + gap <= left(last)) keep.push(i);
    }
    keep.push(last);
    return new Set(keep);
  });

  let allValues = $derived(
    [...curves.thisRange, ...curves.previousRange].map((p) => p.paceMinPerKm).filter((v): v is number => v !== null)
  );
  let yMin = $derived(allValues.length > 0 ? Math.min(...allValues) - 0.15 : 4.5);
  let yMax = $derived(allValues.length > 0 ? Math.max(...allValues) + 0.15 : 7);

  function py(v: number): number {
    return M_TOP + ((v - yMin) / (yMax - yMin || 1)) * PLOT_H;
  }

  function pathFor(points: { paceMinPerKm: number | null }[]): string {
    let d = '';
    points.forEach((p, i) => {
      if (p.paceMinPerKm === null) return;
      d += `${d === '' ? 'M' : 'L'}${X_POS[i]},${py(p.paceMinPerKm).toFixed(1)} `;
    });
    return d.trim();
  }

  let thisPath = $derived(pathFor(curves.thisRange));
  let prevPath = $derived(pathFor(curves.previousRange));
  let thisAreaPath = $derived(thisPath ? `${thisPath} L${X_POS[X_POS.length - 1]},${M_TOP + PLOT_H} L${X_POS[0]},${M_TOP + PLOT_H} Z` : '');

  // Percent faster (positive) or slower (negative) at duration index i,
  // comparing the current range's pace against the previous range's -
  // shared by the 60-min footer badge and the per-point tooltip below.
  function deltaPctAt(i: number): number | null {
    const curr = curves.thisRange[i]?.paceMinPerKm;
    const prev = curves.previousRange[i]?.paceMinPerKm;
    if (!curr || !prev) return null;
    return ((prev - curr) / prev) * 100;
  }

  let delta60min = $derived(deltaPctAt(6));

  let hasData = $derived(allValues.length > 0);

  // Hit-test columns for the tooltip: one per duration bucket, boundaries at
  // the midpoint between adjacent x positions so hovering anywhere near a
  // point (not just exactly on its dot) picks it up.
  let hitBounds = $derived.by(() => {
    const b = [0];
    for (let i = 0; i < X_POS.length - 1; i++) b.push((X_POS[i]! + X_POS[i + 1]!) / 2);
    b.push(VB_W);
    return b;
  });

  let hoverIdx = $state<number | null>(null);

  let hoverY = $derived.by(() => {
    if (hoverIdx === null) return null;
    const v = curves.thisRange[hoverIdx]?.paceMinPerKm ?? curves.previousRange[hoverIdx]?.paceMinPerKm;
    return v != null ? py(v) : M_TOP + PLOT_H / 2;
  });

  let hoverDeltaPct = $derived(hoverIdx !== null ? deltaPctAt(hoverIdx) : null);

  // The tooltip normally floats above its point - too close to the top of the
  // plot (a fast-pace point) and it would overlap the panel title instead, so
  // flip it to sit below the point there.
  let tooltipBelow = $derived(hoverY !== null && hoverY - M_TOP < 40);

  // The tooltip is normally centred on its point - at the first or last
  // duration, centring would push half the box past the edge of the panel
  // (the 60-min point's tooltip was getting clipped off the right side), so
  // anchor it to the point's own edge there instead of centring on it.
  let tooltipAlign = $derived.by((): 'start' | 'center' | 'end' => {
    if (hoverIdx === null) return 'center';
    if (hoverIdx === 0) return 'start';
    if (hoverIdx === LABELS.length - 1) return 'end';
    return 'center';
  });
</script>

{#if !hasData}
  <div class="empty-state" style="padding: var(--space-10) var(--space-4);">Not enough running history yet.</div>
{:else}
  <div class="curve-wrap" bind:clientWidth={containerWidth}>
    <svg use:touchHover viewBox="0 0 {VB_W} {VB_H}" class="curve-svg" style="--chart-label-fs: {labelFontSize}px" role="img" aria-label="Critical pace curve">
      {#each [0, 0.33, 0.66, 1] as f (f)}
        <line x1="0" y1={M_TOP + f * PLOT_H} x2={VB_W} y2={M_TOP + f * PLOT_H} stroke="var(--line-soft)" stroke-width="1" vector-effect="non-scaling-stroke" />
      {/each}

      {#if prevPath}<path d={prevPath} fill="none" stroke="var(--neutral-line)" stroke-width="1.6" vector-effect="non-scaling-stroke" />{/if}
      {#if thisAreaPath}<path d={thisAreaPath} fill="var(--accent)" opacity="0.12" />{/if}
      {#if thisPath}<path d={thisPath} fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" />{/if}

      {#each curves.previousRange as p, i (i)}
        {#if p.paceMinPerKm !== null}
          <circle cx={X_POS[i]} cy={py(p.paceMinPerKm)} r="2.2" fill="var(--bg-well)" stroke="var(--neutral-line)" stroke-width="1.2" vector-effect="non-scaling-stroke" />
        {/if}
      {/each}
      {#each curves.thisRange as p, i (i)}
        {#if p.paceMinPerKm !== null}
          <circle cx={X_POS[i]} cy={py(p.paceMinPerKm)} r="2.6" fill="var(--bg-well)" stroke="var(--accent)" stroke-width="1.4" vector-effect="non-scaling-stroke" />
        {/if}
      {/each}

      {#each LABELS as label, i (i)}
        {#if visibleLabels.has(i)}<text x={X_POS[i]} y={VB_H - 4} text-anchor={i === 0 ? 'start' : i === LABELS.length - 1 ? 'end' : 'middle'} class="chart-axis-label">{label}</text>{/if}
      {/each}

      {#if hoverIdx !== null}
        <line x1={X_POS[hoverIdx]} y1={M_TOP} x2={X_POS[hoverIdx]} y2={M_TOP + PLOT_H} class="crosshair" vector-effect="non-scaling-stroke" />
      {/if}

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      {#each LABELS as _, i (i)}
        <rect
          x={hitBounds[i]}
          y={M_TOP}
          width={hitBounds[i + 1]! - hitBounds[i]!}
          height={PLOT_H}
          fill="transparent"
          onmouseenter={() => (hoverIdx = i)}
          onmouseleave={() => (hoverIdx = null)}
        />
      {/each}
    </svg>

    {#if hoverIdx !== null && hoverY !== null}
      <div
        class="chart-tooltip"
        class:below={tooltipBelow}
        class:align-start={tooltipAlign === 'start'}
        class:align-end={tooltipAlign === 'end'}
        style="left: {(X_POS[hoverIdx]! / VB_W) * 100}%; top: {(hoverY / VB_H) * 100}%;"
      >
        <div class="chart-tooltip-title">{LABELS[hoverIdx]}</div>
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-swatch" style="background: var(--accent);"></span>
          <span class="chart-tooltip-label">current {rangeLabel}</span>
          <span class="chart-tooltip-value">{curves.thisRange[hoverIdx]?.paceMinPerKm != null ? formatPace(curves.thisRange[hoverIdx]!.paceMinPerKm!, unitSystem) : '—'}</span>
        </div>
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-swatch" style="background: var(--neutral-line);"></span>
          <span class="chart-tooltip-label">prev {rangeLabel}</span>
          <span class="chart-tooltip-value">{curves.previousRange[hoverIdx]?.paceMinPerKm != null ? formatPace(curves.previousRange[hoverIdx]!.paceMinPerKm!, unitSystem) : '—'}</span>
        </div>
        {#if hoverDeltaPct !== null}
          <div class="chart-tooltip-delta" style="color: {hoverDeltaPct >= 0 ? 'var(--positive)' : 'var(--caution)'};">
            {Math.abs(hoverDeltaPct).toFixed(1)}% {hoverDeltaPct >= 0 ? 'faster' : 'slower'}
          </div>
        {/if}
      </div>
    {/if}
  </div>
  <div class="curve-footer">
    <span class="zone-key-item mono"><span class="zone-key-swatch" style="background: var(--neutral-line);"></span>prev {rangeLabel}</span>
    <span class="zone-key-item mono"><span class="zone-key-swatch" style="background: var(--accent);"></span>current {rangeLabel}</span>
    {#if delta60min !== null}
      <span class="mono" style="margin-left: auto; color: var(--accent);">{Math.abs(delta60min).toFixed(1)}% {delta60min >= 0 ? 'faster' : 'slower'} at 60 min</span>
    {/if}
  </div>
  <p class="curve-explainer">
    Each point is your fastest pace held for that length of time, from 1 to 60 minutes. Where the current {rangeLabel} line sits above the one
    before it, you're faster at that effort length.
  </p>
{/if}

<style>
  .curve-wrap {
    position: relative;
  }
  .curve-svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .crosshair {
    stroke: var(--border-strong);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  .curve-footer {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    margin-top: var(--space-4);
    font-size: var(--fs-xs);
  }
  .curve-explainer {
    margin: var(--space-5) 0 0;
    font-size: var(--fs-sm);
    line-height: 1.5;
    color: var(--ink-6);
  }
  .chart-tooltip {
    position: absolute;
    /* --tx/--ty compose independently so any horizontal alignment (centred/
       start/end) works with either vertical placement (above/below), rather
       than needing a hardcoded transform per combination. */
    --tx: -50%;
    --ty: -100%;
    transform: translate(var(--tx), var(--ty));
    margin-top: -12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-3) var(--space-5);
    font-size: var(--fs-sm);
    pointer-events: none;
    white-space: nowrap;
    z-index: 5;
  }
  .chart-tooltip.below {
    --ty: 0%;
    margin-top: var(--space-6);
  }
  /* Anchored to the point's own edge instead of centred on it, so the
     tooltip for the first/last duration (whose point sits right at the
     plot's edge) stays inside the panel instead of getting clipped. */
  .chart-tooltip.align-start {
    --tx: 0%;
  }
  .chart-tooltip.align-end {
    --tx: -100%;
  }
  .chart-tooltip-title {
    font-family: var(--font-sans);
    font-weight: var(--fw-medium);
    color: var(--ink-1);
    margin-bottom: var(--space-2);
  }
  .chart-tooltip-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .chart-tooltip-swatch {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .chart-tooltip-label {
    color: var(--ink-5);
  }
  .chart-tooltip-value {
    margin-left: auto;
    padding-left: var(--space-5);
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
    color: var(--ink-1);
    font-variant-numeric: tabular-nums;
  }
  .chart-tooltip-delta {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
    text-align: right;
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
  }
</style>
