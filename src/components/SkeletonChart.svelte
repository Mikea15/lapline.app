<!-- SkeletonChart.svelte - stand-in for a chart panel while its data is still
     loading (a plot area plus a thin axis-label row), built from Skeleton. -->
<script lang="ts">
  import Skeleton from './Skeleton.svelte';

  interface Props {
    height?: string;
  }

  let { height = '180px' }: Props = $props();
</script>

<div class="skeleton-chart">
  <Skeleton width="100%" {height} />
  <div class="skeleton-chart-axis">
    <Skeleton width="40px" height="9px" />
    <Skeleton width="40px" height="9px" />
  </div>
</div>

<style>
  .skeleton-chart {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .skeleton-chart-axis {
    display: flex;
    justify-content: space-between;
  }
</style>
