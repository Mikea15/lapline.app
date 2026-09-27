<!-- RecordsScreen.svelte - lifetime bests and progression, all sports. -->
<script lang="ts">
  import { activitiesStore, settingsStore } from '../../lib/stores.svelte';
  import { computeRecordsStreaming, recordCatalog, milestoneLadders, type RecordResult } from '../../lib/records';
  import { criticalPaceCurves, type CriticalPaceCurves } from '../../lib/critical-pace';
  import { daysAgo, formatDateRangeShort } from '../../lib/date-utils';
  import RecordsTable from '../RecordsTable.svelte';
  import CriticalPaceCurve from '../CriticalPaceCurve.svelte';
  import MilestoneLadder from '../MilestoneLadder.svelte';
  import InfoLabel from '../InfoLabel.svelte';
  import SkeletonChart from '../SkeletonChart.svelte';

  // The record catalog's labels/sports are known statically, with no
  // activity data needed - used to seed every row up front (in a `loading`
  // state) so the table's real structure shows immediately instead of a
  // generic skeleton, and each row's value fills in on its own as that
  // record's own computation resolves rather than all rows appearing at once.
  function emptyRow(def: ReturnType<typeof recordCatalog>[number]): RecordResult {
    return { ...def, bestValue: null, setDate: null, setByActivityId: null, previousValue: null, history: [], loading: true };
  }

  interface Props {
    startDate: string;
    endDate: string;
    /** The header's range-filter label ("12w", "1y", "All", or a formatted
        custom date range) - passed through to the critical pace curve so it
        can name the two windows it's comparing ("current 12w" / "prev 12w")
        instead of the vaguer "this range" / "previous range". */
    rangeLabel: string;
    onSelectActivity: (id: number) => void;
  }

  let { startDate, endDate, rangeLabel, onSelectActivity }: Props = $props();

  let activities = $derived(activitiesStore.all);
  let unitSystem = $derived(settingsStore.getUnitSystem());
  let getDetail = (id: number) => activitiesStore.getDetail(id);

  let records = $state<RecordResult[]>(recordCatalog().map(emptyRow));
  let curves = $state<CriticalPaceCurves>({ thisRange: [], previousRange: [] });
  // Explicit loading flag rather than inferring "still loading" from
  // curves being empty - criticalPaceCurves can legitimately resolve to no
  // data for a range with no matching activities.
  let curvesLoading = $state(true);

  $effect(() => {
    // Re-seed every row back to its loading state up front (not just the
    // ones this activities/date-range change will actually touch) so a
    // stale value from the previous range can never sit there mid-refresh.
    records = recordCatalog().map(emptyRow);
    computeRecordsStreaming(activities, getDetail, (i, r) => {
      records[i] = r;
    });
  });
  $effect(() => {
    curvesLoading = true;
    criticalPaceCurves(activities, getDetail, startDate, endDate).then((c) => {
      curves = c;
      curvesLoading = false;
    });
  });

  let ladders = $derived(milestoneLadders(activities, ['running', 'cycling', 'pool-swim'], startDate, endDate));

  let recordsLoading = $derived(records.some((r) => r.loading));
  let recentRecordsCount = $derived(records.filter((r) => r.setDate !== null && daysAgo(r.setDate) <= 14).length);
</script>

<div class="screen">
  <div class="panel-row-2">
    <div class="panel">
      <div class="panel-head">
        <InfoLabel class="panel-label" text="Personal records" tip="Your best 1/5/10km pace and best 60-minute distance, found by a real sliding-window search over each activity's data — not a fixed list." />
        <span class="panel-meta">{recordsLoading ? '— ' : `${recentRecordsCount} `}set in the last 14 days</span>
      </div>
      <div class="mt-4">
        <RecordsTable {records} {unitSystem} onSelect={onSelectActivity} />
      </div>
    </div>

    <div class="panel">
      <InfoLabel
        class="panel-label"
        text="Critical pace curve"
        tip="Each point is a length of time (1 to 60 minutes). Its value is the fastest pace you held for that whole duration, anywhere in the range - not just an official lap or an all-time PR."
      />
      <p class="panel-prose">How fast you can hold a pace for 1 to 60 minutes straight — current {rangeLabel} vs. the {rangeLabel} before it.</p>
      <div class="mt-4">
        {#if curvesLoading}
          <SkeletonChart height="180px" />
        {:else}
          <CriticalPaceCurve {curves} {unitSystem} {rangeLabel} />
        {/if}
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head">
      <InfoLabel class="panel-label" text="Milestone ladder" tip="Your top-4 longest efforts per sport within the selected date range." />
      <span class="panel-meta">longest effort per sport, {formatDateRangeShort(startDate, endDate)}</span>
    </div>
    <div class="mt-4">
      {#if ladders.every((l) => l.entries.length === 0)}
        <div class="empty-state">No activities in this date range.</div>
      {:else}
        <MilestoneLadder {ladders} {unitSystem} onSelect={onSelectActivity} />
      {/if}
    </div>
  </div>
</div>
