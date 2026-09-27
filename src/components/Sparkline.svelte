<!-- Sparkline.svelte - minimal inline trend indicator, no chart lib needed -->
<script lang="ts">
  interface Props {
    data: number[];
    color?: string;
    width?: number;
    height?: number;
  }

  let { data, color = 'var(--accent)', width = 88, height = 28 }: Props = $props();

  const pad = 3;

  function points(vals: number[]): { x: number; y: number }[] {
    if (vals.length === 0) return [];
    if (vals.length === 1) return [{ x: width / 2, y: height / 2 }];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;
    return vals.map((v, i) => ({
      x: pad + (i / (vals.length - 1)) * innerW,
      y: pad + innerH - ((v - min) / range) * innerH
    }));
  }

  let pts = $derived(points(data));
  let linePath = $derived(pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  let areaPath = $derived(
    pts.length > 1
      ? `${linePath} L${pts[pts.length - 1]!.x.toFixed(1)},${height} L${pts[0]!.x.toFixed(1)},${height} Z`
      : ''
  );
</script>

{#if data.length > 1}
  <!-- width/height stay the logical viewBox size for the point math above;
       the rendered element stretches to fill its container's full width via
       CSS + preserveAspectRatio="none" rather than rendering at that fixed
       pixel size. Height stays a fixed px rather than also stretching - the
       tile's own height is just "as tall as its content needs," so a
       flex-grow height would have nothing real to grow into except by
       force-inflating the tile itself, which is worse than a compact tile. -->
  <svg viewBox="0 0 {width} {height}" preserveAspectRatio="none" class="sparkline" style="height: {height}px;" aria-hidden="true">
    <path d={areaPath} fill={color} opacity="0.1" />
    <path d={linePath} fill="none" stroke={color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
  </svg>
{/if}

<style>
  .sparkline {
    display: block;
    width: 100%;
    overflow: visible;
  }
</style>
