<!-- ValueRangeSlider.svelte - a horizontal dual-handle range slider over a
     plain numeric domain [min, max] (distance in km, duration in minutes,
     etc). Same drag/keyboard mechanics as DateRangeSlider, generalized to
     numbers with a caller-supplied label formatter instead of date parsing. -->
<script lang="ts">
  interface Props {
    min: number;
    max: number;
    start: number;
    end: number;
    step?: number;
    formatValue: (v: number) => string;
  }

  let { min, max, start = $bindable(), end = $bindable(), step = 1, formatValue }: Props = $props();

  function snap(v: number): number {
    return Math.round(v / step) * step;
  }

  let span = $derived(Math.max(step, max - min));

  let startPct = $derived(((start - min) / span) * 100);
  let endPct = $derived(((end - min) / span) * 100);

  let trackEl: HTMLDivElement | undefined = $state();
  let dragging: 'start' | 'end' | null = $state(null);

  function valueFromClientX(clientX: number): number {
    if (!trackEl) return min;
    const rect = trackEl.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return snap(min + pct * span);
  }

  function onHandlePointerDown(handle: 'start' | 'end', e: PointerEvent) {
    dragging = handle;
    e.preventDefault();
  }

  function onWindowPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const v = Math.min(max, Math.max(min, valueFromClientX(e.clientX)));
    if (dragging === 'start') {
      start = Math.min(v, end);
    } else {
      end = Math.max(v, start);
    }
  }

  function onWindowPointerUp() {
    dragging = null;
  }

  function nudge(handle: 'start' | 'end', deltaSteps: number) {
    if (handle === 'start') {
      start = Math.min(max, Math.max(min, start + deltaSteps * step), end);
    } else {
      end = Math.max(min, Math.min(max, end + deltaSteps * step), start);
    }
  }

  function onHandleKeydown(handle: 'start' | 'end', e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') { nudge(handle, -1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { nudge(handle, 1); e.preventDefault(); }
  }
</script>

<svelte:window onpointermove={onWindowPointerMove} onpointerup={onWindowPointerUp} />

<div class="date-slider">
  <div class="date-slider-track" bind:this={trackEl}>
    <div class="date-slider-fill" style="left: {startPct}%; width: {Math.max(0, endPct - startPct)}%"></div>
    <button
      type="button"
      class="date-slider-handle"
      class:dragging={dragging === 'start'}
      style="left: {startPct}%; --pct: {startPct}"
      onpointerdown={(e) => onHandlePointerDown('start', e)}
      onkeydown={(e) => onHandleKeydown('start', e)}
      role="slider"
      aria-label="Minimum"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={start}
      aria-valuetext={formatValue(start)}
    >
      <span class="date-slider-tooltip">{formatValue(start)}</span>
    </button>
    <button
      type="button"
      class="date-slider-handle"
      class:dragging={dragging === 'end'}
      style="left: {endPct}%; --pct: {endPct}"
      onpointerdown={(e) => onHandlePointerDown('end', e)}
      onkeydown={(e) => onHandleKeydown('end', e)}
      role="slider"
      aria-label="Maximum"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={end}
      aria-valuetext={formatValue(end)}
    >
      <span class="date-slider-tooltip">{formatValue(end)}</span>
    </button>
  </div>
  <div class="date-slider-bounds">
    <span>{formatValue(min)}</span>
    <span>{formatValue(max)}</span>
  </div>
</div>
