// lib/chart-scale.ts
import { settingsStore } from './stores.svelte';
import { phone } from './viewport.svelte';

// Every hand-rolled SVG chart in the app draws at a fixed `viewBox` width
// (its own internal coordinate system) that the browser then scales to fit
// whatever real pixel width its container happens to be - a full-width
// panel, a half-width one, a narrower phone layout. A CSS font-size
// declared in those viewBox units scales right along with the geometry, so
// the exact same declared number reads as a completely different real size
// depending on how wide the chart's own viewBox is and how wide its panel
// happens to render - which is why axis labels could look reasonably sized
// on one chart and tiny (or huge) on another even when every component
// declared a similar-looking font-size.
//
// This computes the viewBox-unit font-size that renders at a fixed real
// pixel size (`targetPx`) for a chart's current container width, so every
// chart's axis text ends up the same visual size regardless of its own
// viewBox width or how wide its panel is. Pair it with a `bind:clientWidth`
// on the chart's wrapping element and the shared `.chart-axis-label` CSS
// class (see global.css), which reads the result back via a CSS variable.
//
// The default target is the --fs-sm type token (12px, or 13px on the phone
// ramp in tokens.css) times the user's Text size setting, so chart axis
// text tracks the rest of the type scale.
// A chart's viewBox height for its current container width. Charts keep a
// fixed wide aspect (1000 x ~200) that reads fine on a desktop panel, but a
// ~360px phone panel squashes that to a 60-70px sliver with no room for its
// axis labels - so on a phone the viewBox grows taller until the chart
// renders at least `minPx` high. Unchanged on desktop.
export function chartViewBoxHeight(viewBoxWidth: number, baseHeight: number, containerWidthPx: number, minPx = 170): number {
  if (!phone.current || containerWidthPx <= 0) return baseHeight;
  return Math.max(baseHeight, (minPx * viewBoxWidth) / containerWidthPx);
}

export function chartLabelFontSize(viewBoxWidth: number, containerWidthPx: number, targetPx = (phone.current ? 13 : 12) * settingsStore.getTextScale()): number {
  if (containerWidthPx <= 0) return targetPx; // not measured yet (first paint) - a reasonable fallback, not 0
  return (targetPx * viewBoxWidth) / containerWidthPx;
}

/** Which of `n` equal slots get an axis label, for labels `labelPx` wide
 *  (gap included) over slots `slotPx` wide: every `stride`-th slot counting
 *  back from the last, so the newest is always labelled. The first and last
 *  slots' labels are pinned to the chart's edges rather than centred (so
 *  they aren't clipped), which pushes them toward their neighbour - a
 *  neighbour that would then overlap is dropped. */
export function axisLabelSlots(n: number, slotPx: number, labelPx: number, gapPx = 12): Set<number> {
  const stride = Math.max(1, Math.ceil(labelPx / Math.max(1, slotPx)));
  const slots = new Set<number>();
  for (let i = n - 1; i >= 0; i -= stride) slots.add(i);
  // A pinned edge label covers a full label width inward from the slot's
  // outer edge; its neighbour, centred, needs half a label plus the gap.
  const labelW = labelPx - gapPx;
  const fits = stride * slotPx + slotPx / 2 >= labelW * 1.5 + gapPx;
  if (!fits) {
    if (n - 1 - stride >= 0) slots.delete(n - 1 - stride);
    if (slots.has(0) && n - 1 !== 0) slots.delete(stride);
  }
  return slots;
}
