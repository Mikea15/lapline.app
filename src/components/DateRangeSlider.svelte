<!-- DateRangeSlider.svelte - a horizontal dual-handle range slider over a
     "YYYY-MM-DD" domain [min, max]. Drag the left handle to move `start`,
     the right handle to move `end`; each is clamped so start never passes
     end and vice versa. Values snap to whole days. -->
<script lang="ts">
  import { formatDateShort } from '../lib/date-utils';

  interface Props {
    min: string;
    max: string;
    start: string;
    end: string;
  }

  let { min, max, start = $bindable(), end = $bindable() }: Props = $props();

  function toDay(d: string): number {
    return Math.floor(new Date(d + 'T00:00:00').getTime() / 86400000);
  }
  function fromDay(n: number): string {
    const d = new Date(n * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  let minDay = $derived(toDay(min));
  let maxDay = $derived(toDay(max));
  let span = $derived(Math.max(1, maxDay - minDay));

  let startPct = $derived(((toDay(start) - minDay) / span) * 100);
  let endPct = $derived(((toDay(end) - minDay) / span) * 100);

  let trackEl: HTMLDivElement | undefined = $state();
  let dragging: 'start' | 'end' | null = $state(null);

  function dayFromClientX(clientX: number): number {
    if (!trackEl) return minDay;
    const rect = trackEl.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(minDay + pct * span);
  }

  function onHandlePointerDown(handle: 'start' | 'end', e: PointerEvent) {
    dragging = handle;
    e.preventDefault();
  }

  function onWindowPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const day = Math.min(maxDay, Math.max(minDay, dayFromClientX(e.clientX)));
    if (dragging === 'start') {
      start = fromDay(Math.min(day, toDay(end)));
    } else {
      end = fromDay(Math.max(day, toDay(start)));
    }
  }

  function onWindowPointerUp() {
    dragging = null;
  }

  function nudge(handle: 'start' | 'end', deltaDays: number) {
    if (handle === 'start') {
      start = fromDay(Math.min(toDay(start) + deltaDays, toDay(end)));
    } else {
      end = fromDay(Math.max(toDay(end) + deltaDays, toDay(start)));
    }
  }

  function onHandleKeydown(handle: 'start' | 'end', e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { nudge(handle, -1); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { nudge(handle, 1); e.preventDefault(); }
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
      aria-orientation="horizontal"
      aria-label="Start date"
      aria-valuemin={minDay}
      aria-valuemax={maxDay}
      aria-valuenow={toDay(start)}
      aria-valuetext="{formatDateShort(start)} {start.slice(0, 4)}"
    >
      <span class="date-slider-tooltip">{formatDateShort(start)}</span>
    </button>
    <button
      type="button"
      class="date-slider-handle"
      class:dragging={dragging === 'end'}
      style="left: {endPct}%; --pct: {endPct}"
      onpointerdown={(e) => onHandlePointerDown('end', e)}
      onkeydown={(e) => onHandleKeydown('end', e)}
      role="slider"
      aria-orientation="horizontal"
      aria-label="End date"
      aria-valuemin={minDay}
      aria-valuemax={maxDay}
      aria-valuenow={toDay(end)}
      aria-valuetext="{formatDateShort(end)} {end.slice(0, 4)}"
    >
      <span class="date-slider-tooltip">{formatDateShort(end)}</span>
    </button>
  </div>
  <div class="date-slider-bounds">
    <span>{formatDateShort(min)}</span>
    <span>{formatDateShort(max)}</span>
  </div>
</div>
