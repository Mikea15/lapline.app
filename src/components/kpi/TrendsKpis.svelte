<!-- TrendsKpis.svelte - Trends' top row: five KPI cards in Today's card
     style (KpiCard), each with a small chart over the selected range and its
     change against the equal-length period before it. Follows the page's
     filters: it's given the already-filtered current and previous
     activities. -->
<script lang="ts">
  import KpiCard from '../today/KpiCard.svelte';
  import MiniBars, { type MiniBar } from './MiniBars.svelte';
  import SportBars from './SportBars.svelte';
  import Sparkline from '../Sparkline.svelte';
  import type { Activity } from '../../lib/types';
  import type { ChipTone } from '../today/KpiCard.svelte';
  import { sportFamily, familyShortLabel } from '../../lib/sport-color';
  import { hoursBySport } from '../../lib/today-kpis';
  import { addDays, daysBetween, formatDateShort } from '../../lib/date-utils';
  import { toDisplayDistance, toDisplayElevation, distanceUnit, elevationUnit, formatPace, paceUnit, MI_IN_KM, type UnitSystem } from '../../lib/units';

  interface Props {
    current: Activity[];
    previous: Activity[];
    startDate: string;
    endDate: string;
    unitSystem: UnitSystem;
  }

  let { current, previous, startDate, endDate, unitSystem }: Props = $props();

  const isRun = (a: Activity) => sportFamily(a.sport) === 'running';
  const runKm = (acts: Activity[]) => acts.filter(isRun).reduce((s, a) => s + a.distanceKm, 0);
  const hours = (acts: Activity[]) => acts.reduce((s, a) => s + a.durationMin, 0) / 60;
  const ascent = (acts: Activity[]) => acts.reduce((s, a) => s + a.ascentM, 0);
  function avgRunPace(acts: Activity[]): number {
    const runs = acts.filter((a) => isRun(a) && a.distanceKm > 0.5);
    const dist = runs.reduce((s, a) => s + a.distanceKm, 0);
    return dist > 0 ? runs.reduce((s, a) => s + a.durationMin, 0) / dist : 0;
  }

  // Bars: weekly for ranges up to ~6 months, coarser beyond so a year or
  // "All" stays at about 26 bars.
  let rangeDays = $derived(daysBetween(startDate, endDate) + 1);
  let bucketDays = $derived(Math.max(7, Math.ceil(rangeDays / 26)));
  let bucketCount = $derived(Math.max(1, Math.ceil(rangeDays / bucketDays)));
  let perLabel = $derived(bucketDays === 7 ? 'week' : `${bucketDays} days`);
  let buckets = $derived.by(() => {
    const out: Activity[][] = Array.from({ length: bucketCount }, () => []);
    for (const a of current) {
      const i = Math.floor(daysBetween(startDate, a.date) / bucketDays);
      if (i >= 0 && i < bucketCount) out[i]!.push(a);
    }
    return out;
  });
  function bars(value: (acts: Activity[]) => number, fmt: (v: number) => string): MiniBar[] {
    return buckets.map((acts, i) => {
      const v = value(acts);
      return { value: v, title: `${formatDateShort(addDays(startDate, i * bucketDays))}: ${fmt(v)}` };
    });
  }
  const peak = (b: MiniBar[]) => (b.some((x) => x.value > 0) ? b.reduce((best, x, i) => (x.value > b[best]!.value ? i : best), 0) : -1);

  // "+1.2 km vs prior": green when it moved the better way.
  function change(curr: number, prev: number, text: (diff: number) => string, higherIsBetter = true): { text: string; tone: ChipTone } | null {
    if (prev === 0 || curr === 0) return null;
    const diff = curr - prev;
    if (Math.abs(diff / prev) < 0.01) return { text: '±0%', tone: 'neutral' };
    return { text: text(diff), tone: (higherIsBetter ? diff > 0 : diff < 0) ? 'positive' : 'caution' };
  }
  const signed = (v: number, digits: number) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
  const hm = (h: number) => {
    const m = Math.round(h * 60);
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  };

  let unit = $derived(distanceUnit(unitSystem));
  let km = $derived(runKm(current));
  let kmBars = $derived(bars(runKm, (v) => `${toDisplayDistance(v, unitSystem).toFixed(1)} ${unit}`));

  let sessions = $derived(current.length);
  let sessionBars = $derived(bars((a) => a.length, (v) => `${v} ${v === 1 ? 'activity' : 'activities'}`));
  let perWeek = $derived(sessions / Math.max(1, rangeDays / 7));

  let h = $derived(hours(current));
  let sports = $derived(hoursBySport(current));
  let otherSports = $derived(sports.slice(3));

  let pace = $derived(avgRunPace(current));
  let prevPace = $derived(avgRunPace(previous));
  let paceSeries = $derived(buckets.map(avgRunPace).filter((p) => p > 0));
  let paceDelta = $derived(pace > 0 && prevPace > 0 ? Math.round((pace - prevPace) * 60 * (unitSystem === 'imperial' ? MI_IN_KM : 1)) : 0);

  let up = $derived(ascent(current));
  let elevUnit = $derived(elevationUnit(unitSystem));
  let upBars = $derived(bars(ascent, (v) => `${Math.round(toDisplayElevation(v, unitSystem))} ${elevUnit}`));
</script>

<div class="kpi-row5-wrap">
<div class="kpi-row5">
  <KpiCard
    label="Run volume"
    tip="Total running distance in the selected range, compared with the equal-length period before it. Bars are each {perLabel}."
    edge="var(--sport-running)"
    chip={change(km, runKm(previous), (d) => `${signed(toDisplayDistance(d, unitSystem), 1)} ${unit}`)}
    caption={km > 0 ? `vs prior · per ${perLabel}` : 'no runs in range'}
  >
    <div class="kpi-value-row"><span class="kpi-value">{toDisplayDistance(km, unitSystem).toFixed(1)}</span><span class="kpi-unit">{unit}</span></div>
    <MiniBars bars={kmBars} color="var(--sport-running)" highlight={peak(kmBars)} />
  </KpiCard>

  <KpiCard
    label="Sessions"
    tip="Activities logged in the selected range, and the average per week. Bars are each {perLabel}."
    edge="var(--accent)"
    chip={sessions > 0 ? { text: `${perWeek.toFixed(1)} / wk`, tone: 'neutral' } : null}
    caption={previous.length > 0 ? `${signed(sessions - previous.length, 0)} vs prior · per ${perLabel}` : `per ${perLabel}`}
  >
    <div class="kpi-value-row"><span class="kpi-value">{sessions}</span></div>
    <MiniBars bars={sessionBars} color="var(--accent)" highlight={peak(sessionBars)} />
  </KpiCard>

  <KpiCard
    label="Time trained"
    tip="Total training time across all sports in the selected range, with the three biggest sports broken out."
    edge="var(--ink-5)"
    meta="{sports.length} {sports.length === 1 ? 'sport' : 'sports'}"
    chip={change(h, hours(previous), (d) => `${d > 0 ? '+' : '−'}${hm(Math.abs(d))} h`)}
    caption={otherSports.length > 0 ? `+ ${otherSports.map((s) => familyShortLabel(s.family).toLowerCase()).join(' · ')}` : 'vs prior'}
  >
    <div class="kpi-value-row"><span class="kpi-value">{hm(h)}</span><span class="kpi-unit">h</span></div>
    {#if sports.length > 0}<SportBars sports={sports.slice(0, 3)} />{/if}
  </KpiCard>

  <KpiCard
    label="Avg pace"
    tip="Average running pace across the selected range, weighted by distance. The line is each {perLabel}'s average (faster is higher)."
    edge="var(--zone-3)"
    chip={paceDelta !== 0 ? { text: `${paceDelta > 0 ? '+' : '−'}${Math.abs(paceDelta)} s${paceUnit(unitSystem)}`, tone: paceDelta < 0 ? 'positive' : 'caution' } : null}
    caption={pace > 0 ? 'vs prior · runs only' : 'no runs in range'}
  >
    <div class="kpi-value-row"><span class="kpi-value">{pace > 0 ? formatPace(pace, unitSystem).split(' ')[0] : '—'}</span><span class="kpi-unit">{paceUnit(unitSystem)}</span></div>
    {#if paceSeries.length > 1}
      <!-- Negated so a faster pace draws higher. -->
      <div class="spark"><Sparkline data={paceSeries.map((p) => -p)} color="var(--zone-3)" width={240} height={40} /></div>
    {/if}
  </KpiCard>

  <KpiCard
    label="Elevation"
    tip="Total elevation gained across every activity in the selected range. Bars are each {perLabel}."
    edge="var(--zone-4)"
    chip={change(up, ascent(previous), (d) => `${signed(Math.round(toDisplayElevation(d, unitSystem)), 0)} ${elevUnit}`)}
    caption={up > 0 ? `vs prior · per ${perLabel}` : 'no climbing in range'}
  >
    <div class="kpi-value-row"><span class="kpi-value">{Math.round(toDisplayElevation(up, unitSystem)).toLocaleString()}</span><span class="kpi-unit">{elevUnit}</span></div>
    <MiniBars bars={upBars} color="var(--zone-4)" highlight={peak(upBars)} />
  </KpiCard>
</div>
</div>

<style>
  .spark :global(svg) {
    display: block;
    width: 100%;
    height: 40px;
  }
</style>
