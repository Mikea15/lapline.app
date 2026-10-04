<!-- TodayScreen.svelte - "am I on track, and am I recovered?" in one screen-height. -->
<script lang="ts">
  import { activitiesStore } from '../../lib/stores.svelte';
  import { effortsFill } from '../../lib/efforts-progress.svelte';
  import { settingsStore } from '../../lib/stores.svelte';
  import InfoLabel from '../InfoLabel.svelte';
  import ActivityLedger from '../ActivityLedger.svelte';
  import ConsistencyHeatmap from '../ConsistencyHeatmap.svelte';
  import TrainingLoadPanel from '../today/TrainingLoadPanel.svelte';
  import TimeInZonePanel from '../today/TimeInZonePanel.svelte';
  import ChronicLoadCard from '../today/ChronicLoadCard.svelte';
  import Vo2MaxCard from '../today/Vo2MaxCard.svelte';
  import RunVolumeCard from '../today/RunVolumeCard.svelte';
  import AerobicBaseCard from '../today/AerobicBaseCard.svelte';
  import TimeTrainedCard from '../today/TimeTrainedCard.svelte';
  import RecoveryCard from '../today/RecoveryCard.svelte';
  import { currentRecordHolderIds } from '../../lib/records';
  import { TODAY_LEDGER_SIZE } from '../../lib/today-ledger';
  import { currentVo2Max, weeklyVo2MaxTrend, type Vo2MaxEstimate } from '../../lib/vo2max';
  import { currentRecovery } from '../../lib/recovery';
  import { formatDateDMY } from '../../lib/date-utils';
  import { acuteChronicRatio, runVolumeKm, weeklyLoadBuckets, trailingMean } from '../../lib/training-load';
  import { zoneSeconds } from '../../lib/today-kpis';
  import type { Activity } from '../../lib/types';

  interface Props {
    rangeDays: number;
    /** Settings' default range, as a short label ("12w", "1y",
        "All", or a formatted custom date range) - shown directly on the
        three KPI cards below that scale with it (Run volume, Aerobic base,
        Time trained), so the window each number covers is always the one
        actually selected instead of a handful of unrelated fixed windows. */
    rangeLabel: string;
    onSelectActivity: (id: number) => void;
  }

  let { rangeDays, rangeLabel, onSelectActivity }: Props = $props();

  // The chronic-load trend, VO2max trend and training-load chart all span
  // this many weeks - one shared value derived from the selected range.
  let weeksShown = $derived(Math.max(4, Math.min(52, Math.round(rangeDays / 7))));

  let activities = $derived(activitiesStore.all);
  let unitSystem = $derived(settingsStore.getUnitSystem());

  // Chronic load and the acute:chronic ratio below are a fixed methodology
  // (6-week trailing mean; 7-day acute vs 42-day chronic) rather than a
  // window that should track the header's filter - only how much trend
  // history their sparklines/charts show follows the filter (weeksShown).
  const CHRONIC_LOOKBACK = 6;
  let weeklyLoad = $derived(weeklyLoadBuckets(activities, weeksShown + CHRONIC_LOOKBACK).map((w) => w.load));
  let chronicSeries = $derived(trailingMean(weeklyLoad, CHRONIC_LOOKBACK).slice(CHRONIC_LOOKBACK));

  let ratio = $derived(acuteChronicRatio(activities));
  let recovery = $derived(currentRecovery(activities));

  // Run volume, Aerobic base and Time trained all scale with the default
  // selected range (rangeDays/rangeLabel) rather than each hard-coding its
  // own trailing window.
  let runVolRange = $derived(runVolumeKm(activities, rangeDays));

  // VO2max: estimated from the runner's real best-effort pace via the
  // Daniels-Gilbert VDOT formula (see lib/vo2max.ts) - a different
  // methodology from Garmin's own on-device Firstbeat estimate, which (as of
  // the fit-file-parser v5 upgrade) this app does now parse and show
  // per-activity (Activity screen's Stats panel, "VO₂ max") but deliberately
  // doesn't blend into this KPI, to avoid conflating two different estimates
  // of the same thing into one number.
  let vo2Current = $state<Vo2MaxEstimate>({ value: null, activityId: null, date: null });
  let vo2Trend = $state<(number | null)[]>([]);
  let vo2Loading = $state(true);
  // While the one-off best-efforts fill runs (lib/efforts-store.ts), rows it
  // hasn't reached yet are left out rather than computed here, and the card
  // says so until every run it looks at has one - newest first, so that is
  // soon. It re-reads as the fill ticks.
  let vo2Waiting = $state(false);
  let vo2For: Activity[] | null = null;
  let vo2Run = 0;
  $effect(() => {
    void effortsFill.tick;
    if (vo2For !== activities) {
      vo2For = activities;
      vo2Loading = true;
    }
    const run = ++vo2Run;
    const efforts = activitiesStore.trackedEffortsForView();
    Promise.all([currentVo2Max(activities, efforts.get), weeklyVo2MaxTrend(activities, efforts.get, weeksShown)]).then(([v, t]) => {
      if (run !== vo2Run) return;
      vo2Current = v;
      vo2Trend = t;
      vo2Waiting = efforts.missing() > 0;
      vo2Loading = false;
    });
  });
  // The estimate 4 weeks ago (null if there wasn't one), for the card's
  // trend marker and change.
  let vo2Prior = $derived(vo2Trend[vo2Trend.length - 5] ?? null);

  let recordsPromise = $derived(activitiesStore.allRecords());
  let prIds = $state<Set<number>>(new Set());
  $effect(() => {
    recordsPromise.then((records) => (prIds = currentRecordHolderIds(records)));
  });

  let ledgerActivities = $derived(
    activities
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, TODAY_LEDGER_SIZE)
  );
  let ledgerMeta = $derived.by(() => {
    if (ledgerActivities.length === 0) return 'no sessions yet';
    const oldest = ledgerActivities[ledgerActivities.length - 1]!.date;
    const newest = ledgerActivities[0]!.date;
    return `${ledgerActivities.length} ${ledgerActivities.length === 1 ? 'activity' : 'activities'} · ${formatDateDMY(oldest)} – ${formatDateDMY(newest)}`;
  });

  // Time in zone over the default range, for Aerobic base.
  let weeklyZoneSeconds = $derived(zoneSeconds(activities, rangeDays));
  // The same span just before it, for Aerobic base's change in points.
  let prevZoneSeconds = $derived(zoneSeconds(activities, 2 * rangeDays, rangeDays));
</script>

<div class="screen">
  <div class="kpi-grid">
    <div class="kpi-cards">
      <ChronicLoadCard series={chronicSeries} />
      <Vo2MaxCard value={vo2Current.value} prior={vo2Prior} loading={vo2Loading} waiting={vo2Waiting} />
      <RunVolumeCard {activities} {rangeDays} {rangeLabel} totalKm={runVolRange} />
      <AerobicBaseCard zones={weeklyZoneSeconds} prevZones={prevZoneSeconds} {rangeLabel} />
      <TimeTrainedCard {activities} {rangeDays} {rangeLabel} />
      <RecoveryCard {recovery} {ratio} />
    </div>
  </div>

  <div class="today-split">
    <div class="today-cols">
      <div class="today-main">
        <div class="panel">
          <ConsistencyHeatmap {activities} />
        </div>

        <div class="panel">
          <TrainingLoadPanel {activities} {ratio} {weeksShown} />
        </div>

        <div class="panel">
          <TimeInZonePanel {activities} {rangeDays} {rangeLabel} {weeksShown} />
        </div>
      </div>

      <div class="panel today-side">
        <div class="panel-head">
          <InfoLabel class="panel-label" text="Recent Activities" tip="Your most recent {TODAY_LEDGER_SIZE} sessions, newest first." />
          <span class="panel-meta">{ledgerMeta}</span>
        </div>
        <div class="mt-4">
          {#if ledgerActivities.length === 0}
            <div class="empty-state">No activities yet. Choose Sync to add your first.</div>
          {:else}
            <ActivityLedger activities={ledgerActivities} {unitSystem} {prIds} onSelect={onSelectActivity} />
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  /* The three analysis panels take 60% on the left with the activity
     ledger beside them; narrower than that, they stack with the ledger
     last. */
  .today-split {
    container-type: inline-size;
  }
  .today-cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-6);
    align-items: start;
  }
  .today-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    min-width: 0;
  }
  .today-side {
    min-width: 0;
  }
  @container (min-width: 1100px) {
    .today-cols {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    }
  }

  /* Six cards in a row when there's room, then three, two, one. */
  .kpi-grid {
    container-type: inline-size;
  }
  .kpi-cards {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-6);
  }
  @container (min-width: 560px) {
    .kpi-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @container (min-width: 860px) {
    .kpi-cards {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @container (min-width: 1560px) {
    .kpi-cards {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }
</style>
