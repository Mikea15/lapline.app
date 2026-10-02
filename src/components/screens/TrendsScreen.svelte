<!-- TrendsScreen.svelte - rolling-range training trends. -->
<script lang="ts">
  import TrendsKpis from '../kpi/TrendsKpis.svelte';
  import type { Snippet } from 'svelte';
  import { activitiesStore, settingsStore } from '../../lib/stores.svelte';
  import { addDays, daysBetween, formatDateRangeShort } from '../../lib/date-utils';
  import { sportFamily } from '../../lib/sport-color';
  import type { SportFamily } from '../../lib/sport-color';
  import { toDisplayDistance, distanceUnit, formatPace } from '../../lib/units';
  import { kmSplitPaces } from '../../lib/best-effort';
  import TrendVolumeChart from '../TrendVolumeChart.svelte';
  import EfficiencyScatter from '../EfficiencyScatter.svelte';
  import IntensityStack from '../IntensityStack.svelte';
  import Histogram from '../Histogram.svelte';
  import InfoLabel from '../InfoLabel.svelte';
  import SkeletonChart from '../SkeletonChart.svelte';
  import CriticalPaceCurve from '../CriticalPaceCurve.svelte';
  import { criticalPaceCurves, type CriticalPaceCurves } from '../../lib/critical-pace';
  import TrendsFilterBar from '../TrendsFilterBar.svelte';
  import type { Subject } from '../TrendsFilterBar.svelte';

  interface Props {
    startDate: string;
    endDate: string;
    /** The range filter's label ("12w", "1y", "All", or a formatted
        custom range) - names the two windows the critical pace curve compares. */
    rangeLabel: string;
    /** App's shared range picker, shown in the filter bar. */
    rangeFilter: Snippet;
  }

  let { startDate, endDate, rangeLabel, rangeFilter }: Props = $props();

  let allActivities = $derived(activitiesStore.all);
  let unitSystem = $derived(settingsStore.getUnitSystem());

  // Page-local filter state: Activity Type + Subject (distance/time, for
  // both the volume chart and the value-range slider below). The date
  // window is App's shared range, whose picker App passes in as a snippet
  // for the filter bar.
  // Empty set = "all sports" (no filter) - toggled on/off per sport by
  // clicking its name in TrendsFilterBar, so multiple types can be picked
  // at once to compare them against each other on this page's charts.
  let activityTypes = $state<Set<SportFamily>>(new Set());
  let subject = $state<Subject>('time');

  let rangeLenDays = $derived(daysBetween(startDate, endDate) + 1);
  let numWeeks = $derived(Math.max(4, Math.min(52, Math.round(rangeLenDays / 7))));
  let previousStart = $derived(addDays(startDate, -rangeLenDays));
  let previousEnd = $derived(addDays(startDate, -1));

  function matchesType(a: { sport: string }): boolean {
    return activityTypes.size === 0 || activityTypes.has(sportFamily(a.sport));
  }
  function inCustomRange(a: { date: string }, start: string, end: string): boolean {
    return a.date >= start && a.date <= end;
  }

  // Value-range (distance/time) filter: scoped to Activity Type only (not
  // the date range or the value range itself), so the slider's own bounds
  // stay stable while dragging dates or values, and its "full width" always
  // means "every activity of this type, ever".
  let typeFilteredActivities = $derived(allActivities.filter(matchesType));
  let distanceBoundMax = $derived.by(() => {
    const vals = typeFilteredActivities.map((a) => a.distanceKm).filter((v) => v > 0);
    return vals.length > 0 ? Math.ceil(Math.max(...vals) * 10) / 10 : 10;
  });
  let timeBoundMax = $derived.by(() => {
    const vals = typeFilteredActivities.map((a) => a.durationMin).filter((v) => v > 0);
    return vals.length > 0 ? Math.ceil(Math.max(...vals)) : 60;
  });

  let distanceStart = $state(0);
  let distanceEnd = $state(0);
  let timeStart = $state(0);
  let timeEnd = $state(0);

  $effect(() => {
    // Reset to "everything" whenever Activity Type changes the natural
    // distance scale (e.g. switching from Running to Cycling) - same
    // self-reference caution as the date-range effect above: read only the
    // bound, never distanceStart/distanceEnd themselves.
    const bound = distanceBoundMax;
    distanceStart = 0;
    distanceEnd = bound;
  });
  $effect(() => {
    const bound = timeBoundMax;
    timeStart = 0;
    timeEnd = bound;
  });

  function inValueRange(a: { distanceKm: number; durationMin: number }): boolean {
    return subject === 'distance'
      ? a.distanceKm >= distanceStart && a.distanceKm <= distanceEnd
      : a.durationMin >= timeStart && a.durationMin <= timeEnd;
  }

  let current = $derived(allActivities.filter((a) => matchesType(a) && inCustomRange(a, startDate, endDate) && inValueRange(a)));
  let previous = $derived(allActivities.filter((a) => matchesType(a) && inCustomRange(a, previousStart, previousEnd) && inValueRange(a)));

  function sumRunKm(acts: typeof allActivities): number {
    return acts.filter((a) => sportFamily(a.sport) === 'running').reduce((s, a) => s + a.distanceKm, 0);
  }

  // Per-km split paces for the pace histogram, resampled from each run's raw
  // distance/time stream rather than read off its recorded laps - laps vary
  // with whatever auto-lap distance (or manual presses) the device used, and
  // some devices don't lap at all, so aggregating laps across many
  // activities gave a sparse, inconsistent sample. Needs full activity detail
  // (the stream isn't on the summary Activity row), fetched once per range
  // change.
  let splitPaces = $state<number[]>([]);
  let splitPacesLoading = $state(true);
  $effect(() => {
    splitPacesLoading = true;
    const runs = current.filter((a) => sportFamily(a.sport) === 'running');
    Promise.all(runs.map((a) => activitiesStore.getDetail(a.id))).then((details) => {
      const paces: number[] = [];
      for (const d of details) {
        if (!d) continue;
        paces.push(...kmSplitPaces(d.distance, d.t));
      }
      splitPaces = paces;
      splitPacesLoading = false;
    });
  });

  // Critical pace curve: this range against the equal-length one before it,
  // over runs matching the page's sport and value filters (criticalPaceCurves
  // does the date windows itself). Explicit loading flag, since a range with
  // no runs legitimately resolves to empty curves.
  let curves = $state<CriticalPaceCurves>({ thisRange: [], previousRange: [] });
  let curvesLoading = $state(true);
  $effect(() => {
    curvesLoading = true;
    const acts = allActivities.filter((a) => matchesType(a) && inValueRange(a));
    criticalPaceCurves(acts, (id) => activitiesStore.getDetail(id), startDate, endDate).then((c) => {
      curves = c;
      curvesLoading = false;
    });
  });

  // Per-activity distance/time/HR histograms need no stream fetch - all
  // three are already on the summary Activity row.
  let activityDistancesKm = $derived(current.map((a) => a.distanceKm).filter((v) => v > 0));
  let activityDurationsMin = $derived(current.map((a) => a.durationMin).filter((v) => v > 0));
  let activityAvgHRs = $derived(current.map((a) => a.avgHR).filter((v) => v > 0));

  // "1:15 h" / "42 min" - short enough for a histogram axis label, unlike a
  // full H:MM:SS clock which is more precision than a bucket boundary needs.
  function formatDurationLabel(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`;
  }
</script>

<div class="screen">
  <TrendsFilterBar
    {rangeFilter}
    bind:activityTypes
    bind:subject
    distanceMin={0}
    distanceMax={distanceBoundMax}
    bind:distanceStart
    bind:distanceEnd
    timeMin={0}
    timeMax={timeBoundMax}
    bind:timeStart
    bind:timeEnd
  />

  <TrendsKpis {current} {previous} {startDate} {endDate} {unitSystem} />

  <div class="panel">
    <div class="panel-head">
      <InfoLabel class="panel-label" text="Weekly volume by sport" tip="Running, cycling and swimming volume each week, stacked by sport. The dashed line is your 3-week average." />
      <div class="flex gap-4">
        <span class="panel-meta"><span class="zone-key-swatch" style="background: var(--sport-running); display: inline-block; margin-right: var(--space-2);"></span>Run · {toDisplayDistance(sumRunKm(current), unitSystem).toFixed(1)} {distanceUnit(unitSystem)}</span>
      </div>
    </div>
    <div class="mt-4">
      <TrendVolumeChart activities={current} {numWeeks} metric={subject} />
    </div>
    <p class="chart-explainer">
      Each bar totals that week's training, split by sport; weeks with nothing logged are left out rather than drawn as an empty gap. The dashed
      line is your 3-week average, which smooths out week-to-week swings.
    </p>
  </div>

  <div class="panel-row-2">
    <div class="panel">
      <InfoLabel
        class="panel-label"
        text="Aerobic efficiency"
        tip="Each dot is one run: its pace (up the y-axis, faster at top) against its average heart rate (along the x-axis). A dot up and to the left means a faster pace for a lower heart rate - the sign of real aerobic fitness."
      />
      <p class="panel-prose">Pace at a given heart rate, every run in this range — up-left is fitter.</p>
      <div class="mt-4"><EfficiencyScatter activities={current} {unitSystem} /></div>
      <p class="chart-explainer">
        Each dot is one run: its pace against its average heart rate. Up and to the left means faster for a lower heart rate, a sign of aerobic
        fitness. The line is the trend across your runs, and the label says whether your latest run sat above or below it.
      </p>
    </div>
    <div class="panel">
      <InfoLabel class="panel-label" text="Intensity distribution" tip="Each column is one week's training time split across heart-rate zones 1-5. Weeks without heart-rate data are skipped." />
      <p class="panel-prose">Share of weekly time per zone.</p>
      <div class="mt-4"><IntensityStack activities={current} {numWeeks} /></div>
      <p class="chart-explainer">
        Each bar is one week's training time, split across the five heart-rate zones and normalised to 100% so the effort mix is comparable
        week to week regardless of how much you trained. A polarised plan runs mostly Z1/Z2 with occasional Z4/Z5, not a flat middle.
      </p>
    </div>
    <div class="panel">
      <span class="panel-label">Pace histogram</span>
      <p class="panel-prose">Distribution of km splits, {formatDateRangeShort(startDate, endDate)}.</p>
      <div class="mt-4">
        {#if splitPacesLoading}
          <SkeletonChart height="196px" />
        {:else}
          <Histogram values={splitPaces} formatValue={(v) => formatPace(v, unitSystem)} unitLabel="splits" emptyText="No splits in this range." />
        {/if}
      </div>
      <p class="chart-explainer">
        Every run in range is resampled into real 1km splits from its raw distance stream - not read off the device's own laps, which vary by
        auto-lap distance - so this reflects every kilometre actually run. The dashed line marks the median split.
      </p>
    </div>
    <div class="panel">
      <InfoLabel
        class="panel-label"
        text="Critical pace curve"
        tip="Your critical pace curve: the fastest pace you held for each length of time from 1 to 60 minutes, anywhere in a run. It shows how your pace drops off as efforts get longer."
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
    <div class="panel">
      <span class="panel-label">Distance histogram</span>
      <p class="panel-prose">Distribution of activity distances, {formatDateRangeShort(startDate, endDate)}.</p>
      <div class="mt-4">
        <Histogram
          values={activityDistancesKm}
          formatValue={(v) => `${toDisplayDistance(v, unitSystem).toFixed(1)} ${distanceUnit(unitSystem)}`}
          unitLabel="activities"
          emptyText="No activities with distance in this range."
        />
      </div>
      <p class="chart-explainer">
        One point per activity in range - its total distance. A cluster at one end says your training is mostly one length of session; a spread
        across the range says it's more varied.
      </p>
    </div>
    <div class="panel">
      <span class="panel-label">Time histogram</span>
      <p class="panel-prose">Distribution of activity duration, {formatDateRangeShort(startDate, endDate)}.</p>
      <div class="mt-4">
        <Histogram values={activityDurationsMin} formatValue={formatDurationLabel} unitLabel="activities" emptyText="No activities in this range." />
      </div>
      <p class="chart-explainer">
        One point per activity in range - how long it lasted. A cluster at one end says your sessions are mostly one length; a spread across the
        range says your training mixes short and long days.
      </p>
    </div>
    <div class="panel">
      <span class="panel-label">Avg HR histogram</span>
      <p class="panel-prose">Distribution of average heart rate, {formatDateRangeShort(startDate, endDate)}.</p>
      <div class="mt-4">
        <Histogram values={activityAvgHRs} formatValue={(v) => `${Math.round(v)} bpm`} unitLabel="activities" emptyText="No heart rate data in this range." />
      </div>
      <p class="chart-explainer">
        One point per activity in range - its average heart rate. Weighted toward the low end means mostly easy aerobic work; a spread toward
        the top means more sessions pushed into threshold effort or harder.
      </p>
    </div>
  </div>
</div>
