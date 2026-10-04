<!-- RecordsScreen.svelte - lifetime bests and progression, all sports.
     Always all time; the critical pace curve lives on Trends. -->
<script lang="ts">
  import { activitiesStore, settingsStore } from '../../lib/stores.svelte';
  import { computeRecordsStreaming, recordCatalog, milestoneLadders, type RecordResult } from '../../lib/records';
  import { daysAgo } from '../../lib/date-utils';
  import RecordsTable from '../RecordsTable.svelte';
  import MilestoneLadder from '../MilestoneLadder.svelte';
  import InfoLabel from '../InfoLabel.svelte';
  import EffortsFillNote from '../EffortsFillNote.svelte';
  import { effortsFill } from '../../lib/efforts-progress.svelte';
  import type { Activity } from '../../lib/types';

  // The record catalog's labels/sports are known statically, with no
  // activity data needed - used to seed every row up front (in a `loading`
  // state) so the table's real structure shows immediately instead of a
  // generic skeleton, and each row's value fills in on its own as that
  // record's own computation resolves rather than all rows appearing at once.
  function emptyRow(def: ReturnType<typeof recordCatalog>[number]): RecordResult {
    return { ...def, bestValue: null, setDate: null, setByActivityId: null, previousValue: null, history: [], loading: true };
  }

  interface Props {
    onSelectActivity: (id: number) => void;
  }

  let { onSelectActivity }: Props = $props();

  let activities = $derived(activitiesStore.all);
  let unitSystem = $derived(settingsStore.getUnitSystem());

  let records = $state<RecordResult[]>(recordCatalog().map(emptyRow));

  // While the one-off best-efforts fill runs (lib/efforts-store.ts), the
  // stream-based rows use the efforts it has reached so far - newest first -
  // and re-read as it ticks; one with nothing yet stays a skeleton rather
  // than claim there's no effort.
  let seededFor: Activity[] | null = null;
  let run = 0;
  $effect(() => {
    void effortsFill.tick;
    // Re-seed every row back to its loading state up front, so a stale
    // value can never sit there while the new activities are processed
    // (not on a fill tick: the rows already shown stay until replaced).
    if (seededFor !== activities) {
      seededFor = activities;
      records = recordCatalog().map(emptyRow);
    }
    const thisRun = ++run;
    computeRecordsStreaming(activities, (a) => activitiesStore.getEffortsForView(a), (i, r) => {
      if (thisRun !== run) return;
      const stream = r.kind === 'pace-distance' || r.kind === 'duration-distance';
      records[i] = stream && r.bestValue === null && effortsFill.running ? { ...r, loading: true } : r;
    });
  });

  let ladders = $derived(milestoneLadders(activities, ['running', 'cycling', 'pool-swim'], '0000-01-01', '9999-12-31'));

  let recordsLoading = $derived(records.some((r) => r.loading));
  let recentRecordsCount = $derived(records.filter((r) => r.setDate !== null && daysAgo(r.setDate) <= 14).length);
</script>

<div class="screen">
  <div class="panel">
    <div class="panel-head">
      <InfoLabel class="panel-label" text="Personal records" tip="Your bests across running, swimming and cycling. Times for 1, 5 and 10 km and 100 m count your fastest stretch anywhere in a session, not just a race or lap." />
      <span class="panel-meta">{recordsLoading ? '— ' : `${recentRecordsCount} `}set in the last 14 days</span>
    </div>
    {#if effortsFill.running}
      <div class="mt-4"><EffortsFillNote compact /></div>
    {/if}
    <div class="mt-4">
      <RecordsTable {records} {unitSystem} onSelect={onSelectActivity} />
    </div>
  </div>

  <div class="panel">
    <div class="panel-head">
      <InfoLabel class="panel-label" text="Milestone ladder" tip="Your 4 longest sessions in each sport." />
      <span class="panel-meta">longest effort per sport, all time</span>
    </div>
    <div class="mt-4">
      {#if ladders.every((l) => l.entries.length === 0)}
        <div class="empty-state">No runs, rides or swims yet.</div>
      {:else}
        <MilestoneLadder {ladders} {unitSystem} onSelect={onSelectActivity} />
      {/if}
    </div>
  </div>
</div>
