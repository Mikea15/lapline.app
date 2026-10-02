<!-- CalendarKpis.svelte - the Calendar's top row for the month on screen:
     five KPI cards in Today's card style (KpiCard), each with a small chart
     of the month and a comparison with the month before. -->
<script lang="ts">
  import KpiCard from '../today/KpiCard.svelte';
  import MiniBars, { type MiniBar } from './MiniBars.svelte';
  import SportBars from './SportBars.svelte';
  import DayStrip, { type StripDay } from './DayStrip.svelte';
  import type { Activity } from '../../lib/types';
  import type { ChipTone } from '../today/KpiCard.svelte';
  import { sportFamily, familyColorVar, familyShortLabel, type SportFamily } from '../../lib/sport-color';
  import { hoursBySport } from '../../lib/today-kpis';
  import { activityLoad } from '../../lib/training-load';
  import { formatDateShort } from '../../lib/date-utils';
  import { toDisplayDistance, distanceUnit, type UnitSystem } from '../../lib/units';

  interface Props {
    activities: Activity[];
    year: number;
    month: number; // 1-12
    today: string;
    /** The calendar's Monday-to-Sunday weeks for this month (dates). */
    weeks: string[][];
    unitSystem: UnitSystem;
  }

  let { activities, year, month, today, weeks, unitSystem }: Props = $props();

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const ym = (y: number, m: number) => `${y}-${pad2(m)}`;

  let key = $derived(ym(year, month));
  let prevKey = $derived(month === 1 ? ym(year - 1, 12) : ym(year, month - 1));
  let monthName = $derived(MONTHS[month - 1]!);
  let prevName = $derived(MONTHS[(month + 10) % 12]!);
  let isCurrent = $derived(today.startsWith(key));

  let inMonth = $derived(activities.filter((a) => a.date.startsWith(key)));
  let inPrev = $derived(activities.filter((a) => a.date.startsWith(prevKey)));

  let byDate = $derived.by(() => {
    const m = new Map<string, Activity[]>();
    for (const a of inMonth) m.set(a.date, [...(m.get(a.date) ?? []), a]);
    return m;
  });
  let daysInMonth = $derived(new Date(year, month, 0).getDate());
  let dates = $derived(Array.from({ length: daysInMonth }, (_, i) => `${key}-${pad2(i + 1)}`));
  let elapsed = $derived(dates.filter((d) => d <= today));

  // A day's colour is the sport it had the most minutes of.
  function mainFamily(acts: Activity[]): SportFamily {
    const mins = new Map<SportFamily, number>();
    for (const a of acts) mins.set(sportFamily(a.sport), (mins.get(sportFamily(a.sport)) ?? 0) + a.durationMin);
    return [...mins].sort((x, y) => y[1] - x[1])[0]![0];
  }

  let sessionDays = $derived<StripDay[]>(
    dates.map((d) => {
      const acts = byDate.get(d);
      return {
        date: d,
        color: acts ? familyColorVar(mainFamily(acts)) : null,
        future: d > today,
        title: `${formatDateShort(d)}: ${acts ? `${acts.length} ${acts.length === 1 ? 'session' : 'sessions'}` : 'rest'}`
      };
    })
  );
  let restDays = $derived<StripDay[]>(
    dates.map((d) => ({
      date: d,
      color: byDate.has(d) ? 'var(--bg-well)' : 'var(--ink-5)',
      future: d > today,
      title: `${formatDateShort(d)}: ${byDate.has(d) ? 'trained' : 'rest'}`
    }))
  );
  let restCount = $derived(elapsed.filter((d) => !byDate.has(d)).length);
  let longestBreak = $derived.by(() => {
    let best = 0;
    let run = 0;
    for (const d of elapsed) {
      run = byDate.has(d) ? 0 : run + 1;
      best = Math.max(best, run);
    }
    return best;
  });

  // One bar per calendar week, counting only this month's days.
  function weekBars(value: (acts: Activity[]) => number, fmt: (v: number) => string): MiniBar[] {
    return weeks.map((w) => {
      const days = w.filter((d) => d.startsWith(key));
      const v = value(days.flatMap((d) => byDate.get(d) ?? []));
      return { value: v, title: `Week of ${formatDateShort(w[0]!)}: ${fmt(v)}` };
    });
  }
  let currentWeek = $derived(isCurrent ? weeks.findIndex((w) => w.includes(today)) : -1);
  const peak = (b: MiniBar[]) => (b.some((x) => x.value > 0) ? b.reduce((best, x, i) => (x.value > b[best]!.value ? i : best), 0) : -1);

  function change(curr: number, prev: number, text: (diff: number) => string): { text: string; tone: ChipTone } | null {
    if (prev === 0 || curr === 0) return null;
    const diff = curr - prev;
    if (Math.abs(diff / prev) < 0.01) return { text: '±0%', tone: 'neutral' };
    return { text: text(diff), tone: diff > 0 ? 'positive' : 'caution' };
  }
  const pct = (curr: number, prev: number) => `${curr >= prev ? '+' : '−'}${Math.abs(Math.round(((curr - prev) / prev) * 100))}%`;
  const hm = (h: number) => {
    const m = Math.round(h * 60);
    return `${Math.floor(m / 60)}:${pad2(m % 60)}`;
  };

  let sessions = $derived(inMonth.length);
  let hours = $derived(inMonth.reduce((s, a) => s + a.durationMin, 0) / 60);
  let sports = $derived(hoursBySport(inMonth));
  let perWeek = $derived(hours / Math.max(1, elapsed.length / 7));
  let km = $derived(inMonth.reduce((s, a) => s + a.distanceKm, 0));
  let prevKm = $derived(inPrev.reduce((s, a) => s + a.distanceKm, 0));
  let unit = $derived(distanceUnit(unitSystem));
  let kmBars = $derived(weekBars((acts) => acts.reduce((s, a) => s + a.distanceKm, 0), (v) => `${toDisplayDistance(v, unitSystem).toFixed(1)} ${unit}`));
  let load = $derived(inMonth.reduce((s, a) => s + activityLoad(a), 0));
  let prevLoad = $derived(inPrev.reduce((s, a) => s + activityLoad(a), 0));
  let loadBars = $derived(weekBars((acts) => acts.reduce((s, a) => s + activityLoad(a), 0), (v) => `${Math.round(v)} au`));
  let started = $derived(elapsed.length > 0);
</script>

<div class="kpi-row5-wrap">
<div class="kpi-row5">
  <KpiCard
    label="Sessions"
    tip="Sessions recorded in {monthName}. Each day is coloured by its main sport."
    edge="var(--accent)"
    chip={change(sessions, inPrev.length, (d) => `${d > 0 ? '+' : ''}${d} vs ${prevName.slice(0, 3)}`)}
    caption={isCurrent ? 'this month' : `${monthName} ${year}`}
  >
    <div class="kpi-value-row"><span class="kpi-value">{sessions}</span></div>
    <DayStrip days={sessionDays} />
  </KpiCard>

  <KpiCard
    label="Time trained"
    tip="Total training time in {monthName}, across all sports, with the three biggest sports broken out."
    edge="var(--ink-5)"
    meta="{sports.length} {sports.length === 1 ? 'sport' : 'sports'}"
    chip={hours > 0 ? { text: `${hm(perWeek)} h/wk`, tone: 'neutral' } : null}
    caption={sports.length > 3 ? `+ ${sports.slice(3).map((s) => familyShortLabel(s.family).toLowerCase()).join(' · ')}` : 'avg'}
  >
    <div class="kpi-value-row"><span class="kpi-value">{hm(hours)}</span><span class="kpi-unit">h</span></div>
    {#if sports.length > 0}<SportBars sports={sports.slice(0, 3)} />{/if}
  </KpiCard>

  <KpiCard
    label="Distance"
    tip="Total distance in {monthName}, across all sports. Bars are each calendar week."
    edge="var(--sport-running)"
    chip={change(km, prevKm, () => `${pct(km, prevKm)} vs ${prevName.slice(0, 3)}`)}
    caption="by week"
  >
    <div class="kpi-value-row"><span class="kpi-value">{toDisplayDistance(km, unitSystem).toFixed(1)}</span><span class="kpi-unit">{unit}</span></div>
    <MiniBars bars={kmBars} color="var(--sport-running)" highlight={currentWeek >= 0 ? currentWeek : peak(kmBars)} />
  </KpiCard>

  <KpiCard
    label="Month load"
    tip="Training load for {monthName}: hours of running, cycling and swimming, weighted by sport. Bars are each calendar week."
    edge="var(--zone-4)"
    chip={change(load, prevLoad, () => `${pct(load, prevLoad)} vs ${prevName.slice(0, 3)}`)}
    caption={prevLoad > 0 ? 'by week' : `no ${prevName} data`}
  >
    <div class="kpi-value-row"><span class="kpi-value">{Math.round(load)}</span><span class="kpi-unit">au</span></div>
    <MiniBars bars={loadBars} color="var(--zone-4)" highlight={currentWeek >= 0 ? currentWeek : peak(loadBars)} />
  </KpiCard>

  <KpiCard
    label="Rest days"
    tip="Days so far in {monthName} with no recorded session, and the longest run of them in a row."
    edge="var(--zone-1)"
    chip={started && longestBreak > 0 ? { text: `longest ${longestBreak}d`, tone: 'neutral' } : null}
    caption={started ? (isCurrent ? 'this month' : `${monthName} ${year}`) : "month hasn't started"}
  >
    <div class="kpi-value-row">
      <span class="kpi-value">{started ? restCount : '—'}</span>
      {#if started}<span class="kpi-unit">of {elapsed.length}</span>{/if}
    </div>
    <DayStrip days={restDays} />
  </KpiCard>
</div>
</div>
