<!-- TodayScreen.svelte - "am I on track, and am I recovered?" in one screen-height. -->
<script lang="ts">
  import { activitiesStore } from '../../lib/stores.svelte';
  import { settingsStore } from '../../lib/stores.svelte';
  import InfoLabel from '../InfoLabel.svelte';
  import TrainingLoadChart from '../TrainingLoadChart.svelte';
  import ActivityLedger from '../ActivityLedger.svelte';
  import ConsistencyHeatmap from '../ConsistencyHeatmap.svelte';
  import ZoneStackedBar from '../ZoneStackedBar.svelte';
  import Sparkline from '../Sparkline.svelte';
  import Skeleton from '../Skeleton.svelte';
  import { currentRecordHolderIds } from '../../lib/records';
  import { TODAY_LEDGER_SIZE } from '../../lib/today-ledger';
  import { currentVo2Max, weeklyVo2MaxTrend, type Vo2MaxEstimate } from '../../lib/vo2max';
  import { currentRecovery } from '../../lib/recovery';
  import { formatDateDMY, formatDateShort, daysAgo } from '../../lib/date-utils';
  import {
    acuteChronicRatio,
    runVolumeKm,
    aerobicBasePercent,
    timeTrained,
    weeklyRunVolumeKm,
    weeklyAerobicBasePercent,
    weeklyTimeTrainedHours,
    weeklyLoadBuckets,
    trailingMean
  } from '../../lib/training-load';

  interface Props {
    rangeDays: number;
    /** The header's global range filter, as a short label ("12w", "1y",
        "All", or a formatted custom date range) - shown directly on the
        three KPI cells below that scale with it (Run volume, Aerobic base,
        Time trained), so the window each number covers is always the one
        actually selected instead of a handful of unrelated fixed windows. */
    rangeLabel: string;
    onSelectActivity: (id: number) => void;
  }

  let { rangeDays, rangeLabel, onSelectActivity }: Props = $props();

  // Every sparkline on this screen (chronic load, run volume, aerobic base,
  // time trained, VO2max trend) is this many weeks wide - one shared value
  // derived from the selected range, rather than each having its own
  // independently-chosen width (previously 8, 8, 8, 8 and 12 respectively).
  let weeksShown = $derived(Math.max(4, Math.min(52, Math.round(rangeDays / 7))));

  let activities = $derived(activitiesStore.all);
  let unitSystem = $derived(settingsStore.getUnitSystem());

  function delta(current: number, previous: number, higherIsBetter = true): { text: string; direction: 'positive' | 'caution' | 'neutral' } {
    if (!Number.isFinite(previous) || previous === 0) return { text: '', direction: 'neutral' };
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    if (Math.abs(pct) < 0.5) return { text: '±0%', direction: 'neutral' };
    const good = higherIsBetter ? pct > 0 : pct < 0;
    return { text: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`, direction: good ? 'positive' : 'caution' };
  }

  // Chronic load and the acute:chronic ratio below are a fixed methodology
  // (6-week trailing mean; 7-day acute vs 42-day chronic) rather than a
  // window that should track the header's filter - only how much trend
  // history their sparklines/charts show follows the filter (weeksShown).
  const CHRONIC_LOOKBACK = 6;
  let weeklyLoad = $derived(weeklyLoadBuckets(activities, weeksShown + CHRONIC_LOOKBACK).map((w) => w.load));
  let chronicSeries = $derived(trailingMean(weeklyLoad, CHRONIC_LOOKBACK).slice(CHRONIC_LOOKBACK));
  let chronicLoad = $derived(chronicSeries[chronicSeries.length - 1] ?? 0);
  let chronicLoadDelta = $derived(delta(chronicLoad, chronicSeries[chronicSeries.length - 5] ?? 0));

  let ratio = $derived(acuteChronicRatio(activities));
  let recovery = $derived(currentRecovery(activities));

  // Run volume, Aerobic base and Time trained all scale with the header's
  // selected range (rangeDays/rangeLabel) rather than each hard-coding its
  // own trailing window (previously 7d, 28d and 7d respectively) - that
  // mismatch was confusing on its own terms ("why is this one 4 weeks and
  // that one 7 days?").
  let runVolRange = $derived(runVolumeKm(activities, rangeDays));
  let runVolPrevRange = $derived(runVolumeKm(activities.filter((a) => daysAgo(a.date) >= rangeDays), rangeDays));
  let runVolDelta = $derived(delta(runVolRange, runVolPrevRange));

  let aerobicBaseRange = $derived(aerobicBasePercent(activities, rangeDays));
  let aerobicBasePrevRange = $derived(aerobicBasePercent(activities.filter((a) => daysAgo(a.date) >= rangeDays), rangeDays));
  let aerobicBaseDelta = $derived(
    aerobicBaseRange !== null && aerobicBasePrevRange !== null
      ? delta(aerobicBaseRange, aerobicBasePrevRange)
      : { text: '', direction: 'neutral' as const }
  );

  let trainedRange = $derived(timeTrained(activities, rangeDays));

  let runVolSpark = $derived(weeklyRunVolumeKm(activities, weeksShown));
  let aerobicBaseSpark = $derived(weeklyAerobicBasePercent(activities, weeksShown).filter((v): v is number => v !== null));
  let timeTrainedSpark = $derived(weeklyTimeTrainedHours(activities, weeksShown));

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
  $effect(() => {
    vo2Loading = true;
    const getDetail = (id: number) => activitiesStore.getDetail(id);
    Promise.all([currentVo2Max(activities, getDetail), weeklyVo2MaxTrend(activities, getDetail, weeksShown)]).then(([v, t]) => {
      vo2Current = v;
      vo2Trend = t;
      vo2Loading = false;
    });
  });
  let vo2Spark = $derived(vo2Trend.filter((v): v is number => v !== null));
  let vo2Delta = $derived.by(() => {
    if (vo2Spark.length < 2) return { text: '', direction: 'neutral' as const };
    const prior = vo2Spark.length >= 5 ? vo2Spark[vo2Spark.length - 5] : vo2Spark[0];
    return delta(vo2Spark[vo2Spark.length - 1]!, prior!);
  });

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
    return `${ledgerActivities.length} sessions · ${formatDateDMY(oldest)} – ${formatDateDMY(newest)}`;
  });

  // Time-in-zone for the combined zone bar + polarisation footer, over the
  // header's selected range (rangeDays) rather than a hardcoded trailing
  // week - a session-free "this week" no longer strands the panel empty
  // when the header's range is already showing weeks of real zone data.
  let weeklyZoneSeconds = $derived.by(() => {
    const totals = [0, 0, 0, 0, 0];
    for (const a of activities) {
      if (daysAgo(a.date) < 0 || daysAgo(a.date) >= rangeDays || a.timeInZoneSec.length !== 5) continue;
      for (let i = 0; i < 5; i++) totals[i]! += a.timeInZoneSec[i]!;
    }
    return totals;
  });
  let weeklyZoneTotalSec = $derived(weeklyZoneSeconds.reduce((s, v) => s + v, 0));
  let polarised = $derived.by(() => {
    if (weeklyZoneTotalSec <= 0) return null;
    const easy = weeklyZoneSeconds[0]! + weeklyZoneSeconds[1]!;
    const moderate = weeklyZoneSeconds[2]!;
    const hard = weeklyZoneSeconds[3]! + weeklyZoneSeconds[4]!;
    const pct = (v: number) => Math.round((v / weeklyZoneTotalSec) * 100);
    return `${pct(easy)} / ${pct(moderate)} / ${pct(hard)}`;
  });
  function formatHoursMinutes(sec: number): string {
    const totalMin = Math.round(sec / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
</script>

<div class="screen">
  <div class="stat-strip">
    <div class="stat-cell">
      <InfoLabel class="stat-cell-label" text="Chronic load" tip="6-week trailing average of your weekly training load — your longer-term baseline fitness/fatigue level." />
      <div class="stat-cell-value-row">
        <span class="stat-cell-value mono">{Math.round(chronicLoad)}</span>
        <span class="stat-cell-unit">au</span>
      </div>
      <div class="stat-cell-sparkline"><Sparkline data={chronicSeries} color="var(--ink-1)" height={16} /></div>
      {#if chronicLoadDelta.text}<div class="stat-cell-delta {chronicLoadDelta.direction}">{chronicLoadDelta.text} 4w</div>{/if}
    </div>

    <div class="stat-cell">
      <InfoLabel class="stat-cell-label" text="VO₂ max est." tip="Estimated aerobic fitness (ml of oxygen per kg of body weight per minute), calculated from your best recent race-pace effort." />
      {#if vo2Loading}
        <div class="stat-cell-value-row"><Skeleton width="48px" height="1.4em" /></div>
        <div class="stat-cell-sparkline"><Skeleton width="100%" height="16px" /></div>
        <div class="stat-cell-delta neutral"><Skeleton width="70px" height="0.9em" /></div>
      {:else}
        <div class="stat-cell-value-row">
          <span class="stat-cell-value accent mono">{vo2Current.value !== null ? vo2Current.value : '—'}</span>
          <span class="stat-cell-unit">ml/kg/min</span>
        </div>
        {#if vo2Spark.length > 1}
          <div class="stat-cell-sparkline"><Sparkline data={vo2Spark} color="var(--accent)" height={16} /></div>
        {/if}
        {#if vo2Delta.text}
          <div class="stat-cell-delta {vo2Delta.direction}">{vo2Delta.text} 4w</div>
        {:else}
          <div class="stat-cell-delta neutral">from best real effort</div>
        {/if}
      {/if}
    </div>

    <div class="stat-cell">
      <InfoLabel class="stat-cell-label" text="Run volume" tip="Total running distance over the selected range (the header's range filter, top right)." />
      <div class="stat-cell-value-row">
        <span class="stat-cell-value mono">{runVolRange.toFixed(1)}</span>
        <span class="stat-cell-unit">km / {rangeLabel}</span>
      </div>
      <div class="stat-cell-sparkline"><Sparkline data={runVolSpark} color="var(--ink-1)" height={16} /></div>
      {#if runVolDelta.text}<div class="stat-cell-delta {runVolDelta.direction}">{runVolDelta.text} vs prior {rangeLabel}</div>{/if}
    </div>

    <div class="stat-cell">
      <InfoLabel class="stat-cell-label" text="Aerobic base" tip="Share of the selected range spent at or above Zone 2 heart rate — a proxy for easy-effort, fat-burning base training." />
      <div class="stat-cell-value-row">
        <span class="stat-cell-value mono">{aerobicBaseRange !== null ? Math.round(aerobicBaseRange) : '—'}</span>
        <span class="stat-cell-unit">% z2+</span>
      </div>
      <div class="stat-cell-sparkline"><Sparkline data={aerobicBaseSpark} color="var(--ink-1)" height={16} /></div>
      {#if aerobicBaseDelta.text}<div class="stat-cell-delta {aerobicBaseDelta.direction}">{aerobicBaseDelta.text} pts {rangeLabel}</div>{/if}
    </div>

    <div class="stat-cell">
      <InfoLabel class="stat-cell-label" text="Time trained" tip="Total hours spent training over the selected range, across all sports." />
      <div class="stat-cell-value-row">
        <span class="stat-cell-value mono">{Math.floor(trainedRange.hours)}:{String(Math.round((trainedRange.hours % 1) * 60)).padStart(2, '0')}</span>
        <span class="stat-cell-unit">h / {rangeLabel}</span>
      </div>
      <div class="stat-cell-sparkline"><Sparkline data={timeTrainedSpark} color="var(--ink-1)" height={16} /></div>
      <div class="stat-cell-delta neutral">{trainedRange.sportCount} {trainedRange.sportCount === 1 ? 'sport' : 'sports'}</div>
    </div>

    <div class="stat-cell">
      <InfoLabel
        class="stat-cell-label"
        text="Recovery est."
        tip="Garmin's own on-device recovery-time estimate, counting down from your most recent hard effort — not a live/continuous readiness score, since this app only imports workout FIT files, not continuous wellness monitoring."
      />
      <div class="stat-cell-value-row">
        <span class="stat-cell-value mono">{recovery.hoursRemaining === null ? '—' : recovery.hoursRemaining === 0 ? 'Ready' : recovery.hoursRemaining}</span>
        {#if recovery.hoursRemaining}<span class="stat-cell-unit">h</span>{/if}
      </div>
      <div class="stat-cell-delta neutral">
        {recovery.sourceDate ? `from ${formatDateShort(recovery.sourceDate)}` : 'no device data yet'}
      </div>
    </div>
  </div>

  <div class="panel-row-2">
    <div class="panel">
      <div class="panel-head">
        <InfoLabel class="panel-label" text="Activity ledger" tip="Your most recent {TODAY_LEDGER_SIZE} sessions, newest first." />
        <span class="panel-meta">{ledgerMeta}</span>
      </div>
      <div class="mt-4">
        {#if ledgerActivities.length === 0}
          <div class="empty-state">No activities imported yet.</div>
        {:else}
          <ActivityLedger activities={ledgerActivities} {unitSystem} {prIds} onSelect={onSelectActivity} />
        {/if}
      </div>
    </div>

    <div class="flex flex-col" style="gap: var(--space-6);">
      <div class="panel">
        <div class="panel-head">
          <InfoLabel class="panel-label" text="Consistency" tip="Daily training minutes over a rolling year, darker = more minutes that day. Hover a day for its date and minutes." />
          <span class="panel-meta">rolling year · minutes/day</span>
        </div>
        <div class="mt-4">
          <ConsistencyHeatmap {activities} />
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <InfoLabel class="panel-label" text="Training load" tip="Weekly training load in arbitrary units (au), plotted against the productive band and the 42-day chronic average." />
            <p class="panel-prose">Acute (7d) against chronic (42d) — the ratio's productive-band history.</p>
          </div>
          <div class="flex gap-4" style="text-align: right;">
            <div>
              <InfoLabel class="panel-label" text="Ratio" tip="Acute (7-day) load divided by chronic (42-day) load — the standard acute:chronic training-load ratio used to flag under- or over-training." />
              <div class="mono" style="color: var(--accent); font-size: var(--fs-md);">{ratio.ratio.toFixed(2)}</div>
            </div>
            <div>
              <InfoLabel class="panel-label" text="Status" tip="Where the ratio falls: below ~0.8 is undertraining, 0.8–1.3 is the productive band, above ~1.5 risks overreaching." />
              <div style="color: var(--positive); font-weight: var(--fw-medium); font-size: var(--fs-base);">{ratio.status}</div>
            </div>
          </div>
        </div>
        <div class="mt-4">
          <TrainingLoadChart {activities} {weeksShown} />
        </div>
        <p class="chart-explainer">
          Readiness, HRV and sleep debt aren't tracked here — this app only imports workout FIT files, which don't carry wellness data — so the
          ratio above is used as the closest available stand-in for how recovered you are.
        </p>
      </div>

      <div class="panel">
        <InfoLabel class="panel-label" text="Time in zone" tip="How training time over the selected range (the header's range filter, top right) splits across heart-rate zones 1-5." />
        <div class="mt-4">
          <ZoneStackedBar values={weeklyZoneSeconds} />
        </div>
        <div class="flex justify-between mt-2">
          {#if polarised !== null}
            <InfoLabel
              class="panel-meta"
              text="easy/mod/hard {polarised}"
              tip="Share of the selected range's training time spent easy (Z1-2), moderate (Z3) and hard (Z4-5). A polarised plan keeps most time easy with only a small hard fraction."
            />
          {:else}
            <span class="panel-meta">no sessions in {rangeLabel}</span>
          {/if}
          <span class="panel-meta">{formatHoursMinutes(weeklyZoneTotalSec)} total · {rangeLabel}</span>
        </div>
      </div>
    </div>
  </div>
</div>
