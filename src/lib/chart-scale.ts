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
