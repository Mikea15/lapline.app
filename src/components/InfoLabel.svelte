<!-- InfoLabel.svelte - a metric/panel label with a small hover/focus explainer.
     Renders inline so callers keep applying their own layout class
     (stat-cell-label, panel-label, ...) on the wrapping span. -->
<script lang="ts">
  import { tick } from 'svelte';

  interface Props {
    text: string;
    tip: string;
    class?: string;
  }

  let { text, tip, class: className = '' }: Props = $props();

  // Hover/keyboard focus open the tip through CSS alone (global.css). A
  // touchscreen has neither, so a tap toggles it open here instead - and
  // any tap elsewhere, Escape or scrolling closes it again.
  let open = $state(false);
  let buttonEl = $state<HTMLButtonElement | null>(null);
  let tipEl = $state<HTMLSpanElement | null>(null);
  // Nudges applied while open so the tip stays on screen: a horizontal
  // shift off the viewport's edges, and flipping below the label when there
  // isn't room above it (under the sticky header).
  let shiftX = $state(0);
  let below = $state(false);

  async function toggle() {
    open = !open;
    if (!open) return;
    shiftX = 0;
    below = false;
    await tick();
    if (!tipEl) return;
    const margin = 8;
    const r = tipEl.getBoundingClientRect();
    if (r.right > window.innerWidth - margin) shiftX = window.innerWidth - margin - r.right;
    if (r.left + shiftX < margin) shiftX = margin - r.left;
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
    below = r.top < headerH + margin;
  }

  $effect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      if (e.type === 'pointerdown' && buttonEl?.contains(e.target as Node)) return;
      open = false;
    };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', close, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', close);
    };
  });
</script>

<button
  type="button"
  class="info-label {className}"
  class:open
  class:below
  bind:this={buttonEl}
  aria-expanded={open}
  onclick={toggle}
  style={shiftX ? `--tip-shift: ${shiftX}px;` : undefined}
>
  {text}
  <span class="info-tip" role="tooltip" bind:this={tipEl}>{tip}</span>
</button>
