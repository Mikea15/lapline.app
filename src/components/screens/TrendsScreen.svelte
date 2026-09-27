<!-- TrendsScreen.svelte - rolling-range training trends. -->
<script lang="ts">
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
  import TrendsFilterBar from '../TrendsFilterBar.svelte';
  import type { Subject } from '../TrendsFilterBar.svelte';

  interface Props {
    startDate: string;
    endDate: string;
  }

  let { startDate, endDate }: Props = $props();

  let allActivities = $derived(activitiesStore.all);
  let unitSystem = $derived(settingsStore.getUnitSystem());

  // Page-local filter state: Activity Type + Subject (distance/time, for
  // both the volume chart and the value-range slider below). The date
  // window itself is the header's global range, passed straight in - this
  // page no longer has its own date control.
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
  function sumHours(acts: typeof allActivities): number {
    return acts.reduce((s, a) => s + a.durationMin, 0) / 60;
  }
  function sumAscent(acts: typeof allActivities): number {
    return acts.reduce((s, a) => s + a.ascentM, 0);
  }
  function avgRunPace(acts: typeof allActivities): number {
    const runs = acts.filter((a) => sportFamily(a.sport) === 'running' && a.distanceKm > 0.5);
    const dist = runs.reduce((s, a) => s + a.distanceKm, 0);
    const dur = runs.reduce((s, a) => s + a.durationMin, 0);
    return dist > 0 ? dur / dist : 0;
  }

  function delta(curr: number, prev: number, unit = '', higherIsBetter = true): { text: string; direction: 'positive' | 'caution' | 'neutral' } {
    if (prev === 0) return { text: '', direction: 'neutral' };
    const diff = curr - prev;
    const pct = (diff / Math.abs(prev)) * 100;
    if (Math.abs(pct) < 1) return { text: '±0%', direction: 'neutral' };
    const good = higherIsBetter ? diff > 0 : diff < 0;
    return { text: `${diff > 0 ? '+' : ''}${diff.toFixed(1)}${unit} vs prior`, direction: good ? 'positive' : 'caution' };
  }

  let totalVolumeKm = $derived(sumRunKm(current));
  let totalVolumeDelta = $derived(delta(totalVolumeKm, sumRunKm(previous), ' km'));
  let sessions = $derived(current.length);
  let sessionsPerWeek = $derived((sessions / (rangeLenDays / 7)).toFixed(1));
  let movingHours = $derived(sumHours(current));
  let movingHoursDelta = $derived(delta(movingHours, sumHours(previous), 'h'));
  let avgPace = $derived(avgRunPace(current));
  let avgPacePrev = $derived(avgRunPace(previous));
  let paceDeltaSec = $derived(avgPace > 0 && avgPacePrev > 0 ? Math.round((avgPace - avgPacePrev) * 60) : 0);
  let ascentM = $derived(sumAscent(current));

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

  <div class="stat-strip">
    <div class="stat-cell">
      <InfoLabel class="stat-cell-label" text="Total volume" tip="Total running distance in the selected range, compared to the equal-length period before it." />
      <div class="stat-cell-value-row"><span class="stat-cell-value mono">{toDisplayDistance(totalVolumeKm, unitSystem).toFixed(1)}</span><span class="stat-cell-unit">{distanceUnit(unitSystem)} run</span></div>
      {#if totalVolumeDelta.text}<div class="stat-cell-delta {totalVolumeDelta.direction}">{totalVolumeDelta.text}</div>{/if}
    </div>
    <div class="stat-cell">
      <InfoLabel class="stat-cell-label" text="Sessions" tip="Number of activities logged in the selected range, and the average per week." />
      <div class="stat-cell-value-row"><span class="stat-cell-value mono">{sessions}</span><span class="stat-cell-unit">{formatDateRangeShort(startDate, endDate)}</span></div>
      <div class="stat-cell-delta neutral">{sessionsPerWeek} / week</div>
    </div>
    <div class="stat-cell">
      <InfoLabel class="stat-cell-label" text="Moving time" tip="Total hours spent actively training across all sports in the selected range." />
      <div class="stat-cell-value-row"><span class="stat-cell-value mono">{movingHours.toFixed(1)}</span><span class="stat-cell-unit">hours</span></div>
      {#if movingHoursDelta.text}<div class="stat-cell-delta {movingHoursDelta.direction}">{movingHoursDelta.text}</div>{/if}
    </div>
    <div class="stat-cell">
      <InfoLabel class="stat-cell-label" text="Avg pace" tip="Average running pace across the selected range, weighted by distance." />
      <div class="stat-cell-value-row"><span class="stat-cell-value mono">{avgPace > 0 ? formatPace(avgPace, unitSystem) : '—'}</span></div>
      {#if paceDeltaSec !== 0}<div class="stat-cell-delta {paceDeltaSec < 0 ? 'positive' : 'caution'}">{paceDeltaSec > 0 ? '+' : ''}{paceDeltaSec} s/km</div>{/if}
    </div>
    <div class="stat-cell">
      <InfoLabel class="stat-cell-label" text="Elevation" tip="Total elevation gained, summed across every activity in the selected range." />
      <div class="stat-cell-value-row"><span class="stat-cell-value mono">{Math.round(ascentM).toLocaleString()}</span><span class="stat-cell-unit">m gained</span></div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head">
      <InfoLabel class="panel-label" text="Weekly volume by sport" tip="Weekly training volume, stacked by sport, with a 3-week trailing mean overlay." />
      <div class="flex gap-4">
        <span class="panel-meta"><span class="zone-key-swatch" style="background: var(--sport-running); display: inline-block; margin-right: var(--space-2);"></span>Run · {toDisplayDistance(sumRunKm(current), unitSystem).toFixed(1)} {distanceUnit(unitSystem)}</span>
      </div>
    </div>
    <div class="mt-4">
      <TrendVolumeChart activities={current} {numWeeks} metric={subject} />
    </div>
    <p class="chart-explainer">
      Each bar totals that week's training, split by sport; weeks with nothing logged are left out rather than drawn as an empty gap. The dashed
      line is a 3-week trailing mean of the total, smoothing week-to-week noise so the underlying trend stands out.
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
        Each dot is one run: how fast you went (higher up the y-axis) against how hard your heart was working to get there (further right on the
        x-axis) - so a dot up and to the left of the others means a faster pace for a lower heart rate that day, real aerobic fitness rather than
        just a fast day. The line is the best straight-line fit through every run in range; r² (0 to 1) says how closely your runs actually follow
        it - near 1 means a tight, predictable relationship between effort and pace, near 0 means a lot of run-to-run scatter. The badge on the
        right compares your most recent run to what that line predicts for its heart rate: "improving" means it beat the trend (faster than
        expected), "attention" means it fell short.
      </p>
    </div>
    <div class="panel">
      <span class="panel-label">Intensity distribution</span>
      <p class="panel-prose">Share of weekly time per zone.</p>
      <div class="mt-4"><IntensityStack activities={current} {numWeeks} /></div>
      <p class="chart-explainer">
        Each bar is one week's training time, split across the five heart-rate zones and normalised to 100% so the effort mix is comparable
        week to week regardless of how much you trained. A polarized plan runs mostly Z1/Z2 with occasional Z4/Z5, not a flat middle.
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
