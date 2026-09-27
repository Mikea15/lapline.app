<!-- Skeleton.svelte - a shimmering placeholder block for any panel/chart/table
     that's waiting on an async computation (a Dexie read per activity, a
     sliding-window search over many activities' streams). Sized via
     width/height/radius to roughly match what it's standing in for, so
     swapping in the real content doesn't cause a layout jump. -->
<script lang="ts">
  interface Props {
    width?: string;
    height?: string;
    radius?: string;
  }

  let { width = '100%', height = '14px', radius = 'var(--radius-sm)' }: Props = $props();
</script>

<div class="skeleton" style="width: {width}; height: {height}; border-radius: {radius};" aria-hidden="true"></div>

<style>
  .skeleton {
    background: linear-gradient(90deg, var(--bg-well) 25%, var(--line-panel) 37%, var(--bg-well) 63%);
    background-size: 400% 100%;
    animation: skeleton-shimmer 1.4s ease infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
      background: var(--bg-well);
    }
  }

  @keyframes skeleton-shimmer {
    0% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0 50%;
    }
  }
</style>
