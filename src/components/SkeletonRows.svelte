<!-- SkeletonRows.svelte - stand-in for a table while its rows are still
     loading, built from Skeleton. Widths vary by position (a fixed pattern,
     not random) purely so the placeholder doesn't look like a literal grid
     of identical bars. -->
<script lang="ts">
  import Skeleton from './Skeleton.svelte';

  interface Props {
    rows?: number;
  }

  let { rows = 5 }: Props = $props();

  const WIDTH_PATTERN = ['92%', '78%', '85%', '65%', '88%'];
</script>

<div class="skeleton-rows">
  {#each { length: rows } as _, i (i)}
    <Skeleton width={WIDTH_PATTERN[i % WIDTH_PATTERN.length]} height="13px" />
  {/each}
</div>

<style>
  .skeleton-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: var(--space-2) 0;
  }
</style>
