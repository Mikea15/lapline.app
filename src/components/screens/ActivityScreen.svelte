<!-- ActivityScreen.svelte - forensic read of a single session. -->
<script lang="ts">
  import { tick } from 'svelte';
  import { activitiesStore, settingsStore } from '../../lib/stores.svelte';
  import RouteMap from '../RouteMap.svelte';
  import PlanRouteMap from '../PlanRouteMap.svelte';
  import PoolRouteMap from '../PoolRouteMap.svelte';
  import EffortTape from '../EffortTape.svelte';
  import EffortPhaseStrip from '../EffortPhaseStrip.svelte';
  import KmTiles from '../KmTiles.svelte';
  import StreamChart from '../StreamChart.svelte';
  import SwimLengthTiles from '../SwimLengthTiles.svelte';
  import TimeInZones from '../TimeInZones.svelte';
  import HrDensity from '../HrDensity.svelte';
  import SessionRecord from '../SessionRecord.svelte';
  import InfoLabel from '../InfoLabel.svelte';
  import ActivityLedger from '../ActivityLedger.svelte';
  import ActivityFilterBar from '../ActivityFilterBar.svelte';
  import Skeleton from '../Skeleton.svelte';
  import SkeletonChart from '../SkeletonChart.svelte';
  import SkeletonRows from '../SkeletonRows.svelte';
  import { sportFamily, formatSport, type SportFamily } from '../../lib/sport-color';
  import { formatElevationRange, toDisplayDistance, distanceUnit, poolMeters, formatPace, formatElevation, formatTemp, formatSpeed, paceUnit, speedUnit, toDisplayElevation, elevationUnit } from '../../lib/units';
  import { formatDateLong, formatClock } from '../../lib/date-utils';
  import { trainingEffectLabel } from '../../lib/training-feel';
  import { altitudeRange as altitudeRangeOf } from '../../lib/altitude-range';
  import { segmentEffortPhases } from '../../lib/effort-phases';
  import { currentRecordHolderIds } from '../../lib/records';
  import { activitySortValue, rateSortValue, type ActivitySortKey } from '../../lib/activity-rate';
  import { geocode } from '../../lib/geocode';
  import { lookupWeatherCondition } from '../../lib/weather';
  import { firstFix } from '../../lib/geo';
  import type { ActivityDetail } from '../../lib/types';

  interface Props {
    activityId: number | null;
    onSelectActivity: (id: number) => void;
    onBack: () => void;
  }

  let { activityId, onSelectActivity, onBack }: Props = $props();

  // The list view (no activity selected) - every imported activity, in the
  // same table the Today ledger uses, just uncapped and with its own
  // filter/sort - lets you browse the full history instead of only the 15
  // most recent (Today) or whichever ones happen to hold a record (Records).
  let allActivities = $derived(activitiesStore.all);
  let allPrIds = $state<Set<number>>(new Set());
  $effect(() => {
    activitiesStore.allRecords().then((records) => {
      allPrIds = currentRecordHolderIds(records);
    });
  });

  // Empty set = "all sports" (no filter) - toggled per-sport, matching
  // Trends' Activity Type filter (see ActivityTypeFilter.svelte).
  let activityTypeFilter = $state<Set<SportFamily>>(new Set());
  let sortKey = $state<ActivitySortKey>('date');
  let sortDir = $state<'asc' | 'desc'>('desc');

  // Clicking the currently-sorted column flips direction; clicking a
  // different one switches to it - defaulting to descending, matching the
  // list's original (date, newest-first) default so switching columns never
  // feels like it "reset" to some unrelated order.
  function toggleSort(key: ActivitySortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'desc';
    }
  }

  let filteredActivities = $derived(
    activityTypeFilter.size === 0 ? allActivities : allActivities.filter((a) => activityTypeFilter.has(sportFamily(a.sport)))
  );

  // Nulls (a value that isn't meaningful for this row, e.g. no distance on a
  // cardio session) always sort to the end regardless of direction, rather
  // than landing at the top on a descending sort or scattering through the
  // middle - keeps the "real" values grouped and orderly either way.
  let sortedActivities = $derived.by(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return filteredActivities.slice().sort((a, b) => {
      const av = activitySortValue(a, sortKey);
      const bv = activitySortValue(b, sortKey);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  });

  let detail = $state<ActivityDetail | null>(null);
  let loading = $state(false);

  $effect(() => {
    const id = activityId;
    // Scrub seconds are relative to whichever activity's own timeline they
    // came from - carrying one over to a newly-opened activity (this
    // component instance persists across activity navigation, it doesn't
    // remount) would scrub to a nonsense position in the new activity.
    chartSyncX = null;
    lastScrubSec = null;
    if (id === null) {
      detail = null;
      return;
    }
    loading = true;
    activitiesStore.getDetail(id).then((d) => {
      if (activityId === id) {
        detail = d;
        loading = false;
      }
    });
  });

  // Opt-in reverse geocoding (Settings > Location lookup, off by default -
  // see lib/geocode.ts): resolves the route's start coordinate to a place
  // name once per activity and persists it, so revisiting never re-queries.
  // No-op (leaves locationLabel undefined) while the setting is off, so
  // turning it on later still geocodes every activity the first time it's
  // opened rather than only ones imported after the toggle flipped.
  $effect(() => {
    const d = detail;
    if (!d || d.locationLabel !== undefined || !settingsStore.getLocationLookupEnabled()) return;
    const fix = firstFix(d.lat, d.lon);
    const id = d.id;
    if (!fix) {
      // No GPS at all (e.g. a pool swim) - mark as looked-up-with-nothing-
      // found so this effect doesn't re-fire every time the panel reopens.
      activitiesStore.setLocationLabel(id, '');
      if (detail && detail.id === id) detail = { ...detail, locationLabel: '' };
      return;
    }
    geocode(fix.lat, fix.lon).then((label) => {
      if (label === null) return; // failed for now - leave undefined so a later visit retries
      activitiesStore.setLocationLabel(id, label);
      if (detail && detail.id === id) detail = { ...detail, locationLabel: label };
    });
  });

  // Opt-in weather lookup (Settings > Weather lookup, off by default - see
  // lib/weather.ts): same one-time-per-activity shape as the location
  // lookup above, gated on its own separate toggle.
  $effect(() => {
    const d = detail;
    if (!d || d.weatherCondition !== undefined || !settingsStore.getWeatherLookupEnabled()) return;
    const fix = firstFix(d.lat, d.lon);
    const id = d.id;
    if (!fix) {
      activitiesStore.setWeatherCondition(id, '');
      if (detail && detail.id === id) detail = { ...detail, weatherCondition: '' };
      return;
    }
    lookupWeatherCondition(fix.lat, fix.lon, d.date, d.startTimeLabel, d.startUtc).then((condition) => {
      if (condition === null) return; // no answer yet (offline, archive lag) - retry on a later visit
      activitiesStore.setWeatherCondition(id, condition);
      if (detail && detail.id === id) detail = { ...detail, weatherCondition: condition };
    });
  });

  let unitSystem = $derived(settingsStore.getUnitSystem());
  let chartSyncX = $state<number | null>(null);

  // Tape's Route panel toggle - Plan (flat top-down) is the new default view
  // there; Relief reuses the existing isometric reconstruction as-is.
  let routeView = $state<'plan' | 'relief'>('plan');

  // Two-way hover link between the km tiles / Splits-style lap identity and
  // the route's lap pins - one shared value, fed by either side's own
  // hover, read by both.
  let hoveredLapIndex = $state<number | null>(null);

  // Remembers the last real hover/scrub position so mouseleave doesn't snap
  // the whole page (readout, route marker, tile highlights) back to the
  // start-of-activity default every time the pointer leaves the Timeline
  // chart - that default is only meant for "never touched this activity
  // yet", not "just looked away for a second".
  let lastScrubSec = $state<number | null>(null);
  $effect(() => {
    if (chartSyncX !== null) lastScrubSec = chartSyncX;
  });

  let scrubIndex = $derived.by(() => {
    if (!detail || detail.t.length === 0) return null;
    const targetSec = chartSyncX ?? lastScrubSec;
    if (targetSec === null) {
      // True initial state - this activity has never been scrubbed
      // (bug-list.md: previously defaulted to 0.72 of the activity, a
      // design-handoff holdover from the removed Atlas hero, which read as
      // an arbitrary jump-to-the-middle rather than "the start") - starts
      // at the first real sample instead, so the readout/route marker show
      // the activity's actual beginning on first paint.
      return 0;
    }
    let best = 0;
    let bestDist = Infinity;
    detail.t.forEach((t, i) => {
      const d = Math.abs(t - targetSec);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  });

  // Which real lap the current scrub position falls inside - drives the km
  // tile grid's scrub-highlight, independent of hoveredLapIndex (hover),
  // so scrubbing the effort tape highlights a tile even when the pointer
  // never touches the tile grid itself. Same "last lap whose own start has
  // already passed" rule EffortTape/RouteMap already use for their own
  // lap-boundary lookups.
  let scrubLapIndex = $derived.by(() => {
    if (!detail || scrubIndex === null || detail.laps.length === 0) return null;
    const currentSec = detail.t[scrubIndex] ?? 0;
    let idx = 0;
    detail.laps.forEach((lap, i) => {
      if (currentSec >= lap.startOffsetSec) idx = i;
    });
    return idx;
  });

  // Same idea as scrubLapIndex, over pool-swim's real lengths instead of
  // running-style laps - drives SwimLengthTiles' scrub-highlight.
  let scrubLengthIndex = $derived.by(() => {
    if (!detail || scrubIndex === null || detail.lengths.length === 0) return null;
    const currentSec = detail.t[scrubIndex] ?? 0;
    let idx = 0;
    detail.lengths.forEach((length, i) => {
      if (currentSec >= length.startOffsetSec) idx = i;
    });
    return idx;
  });

  // The km the Timeline highlights: a hovered km tile (or route lap pin)
  // wins, otherwise the km under an active scrub/hover. Nothing while
  // idle - scrubLapIndex alone always resolves to some lap (the default
  // scrub position), which would leave a permanent highlight.
  let timelineHighlightLapIndex = $derived.by(() => {
    if (!detail) return null;
    if (hoveredLapIndex !== null) {
      const i = detail.laps.findIndex((l) => l.index === hoveredLapIndex);
      return i >= 0 ? i : null;
    }
    return chartSyncX !== null ? scrubLapIndex : null;
  });

  let avgPaceMinPerKm = $derived(detail && detail.distanceKm > 0.05 ? detail.durationMin / detail.distanceKm : 0);
  // Session average pace, seconds/100m - the same real number
  // lib/activity-rate.ts's rateSortValue already computes for pool swims
  // (reused for the hero's rate cell too), just kept as a raw number here
  // for SwimLengthTiles' own per-length pace-vs-average delta.
  let avgSwimPaceSecPer100 = $derived(detail && sportFamily(detail.sport) === 'pool-swim' ? (rateSortValue(detail) ?? 0) : 0);

  function formatSecPer100Bare(sec: number): string {
    return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  }

  // Tape hero's distance cell - hidden entirely (not a "—" placeholder) when
  // there's no real distance at all (cardio, indoor cardio, generic/other),
  // and shown in metres rather than a sub-1 km "0.48 km" for pool swims,
  // matching how the Activities ledger already displays swim distance.
  let heroDistance = $derived.by(() => {
    if (!detail || detail.distanceKm <= 0) return null;
    if (sportFamily(detail.sport) === 'pool-swim') return { value: String(poolMeters(detail.distanceKm)), unit: 'm' };
    return { value: toDisplayDistance(detail.distanceKm, unitSystem).toFixed(2), unit: distanceUnit(unitSystem) };
  });

  // Tape hero's second big number - the same per-sport "rate" the
  // Activities ledger already computes (lib/activity-rate.ts): pace for
  // running, speed for cycling, pace/100m for pool swim, hidden entirely
  // for cardio/other (no distance -> no meaningful rate, not a "—" filler).
  // Previously this cell always showed a running-style min/km pace
  // regardless of sport - real but nonsensical numbers for a bike ride
  // ("4:36 /km") or a swim ("44:03 /km", the real total time expressed as
  // if 480m were a full kilometre).
  let heroRate = $derived.by(() => {
    if (!detail) return null;
    const family = sportFamily(detail.sport);
    const v = rateSortValue(detail);
    if (v === null) return null;
    if (family === 'running') return { value: formatPace(v, unitSystem).split(' ')[0]!, unit: paceUnit(unitSystem) };
    if (family === 'cycling') return { value: formatSpeed(v, unitSystem).split(' ')[0]!, unit: speedUnit(unitSystem) };
    if (family === 'pool-swim') {
      const m = Math.floor(v / 60);
      const s = Math.round(v % 60);
      return { value: `${m}:${String(s).padStart(2, '0')}`, unit: '/100m' };
    }
    return null;
  });
  // Real length-by-length data (only present for a re-parsed pool-swim
  // activity) gets the swim-specific splits table and the schematic pool
  // route; everything else, including a pool-swim imported before this
  // feature existed, falls back to the generic lap-based views rather than
  // showing nothing.
  let isPoolSwimWithLengths = $derived(!!detail && sportFamily(detail.sport) === 'pool-swim' && detail.lengths.length > 0);
  // Ascent is meaningless for pool swimming (no real elevation change
  // happens lap after lap in a flat pool) - hidden for every pool-swim
  // activity, not just ones with real length data.
  let isPoolSwim = $derived(!!detail && sportFamily(detail.sport) === 'pool-swim');
  let hasAltitude = $derived(!!detail && detail.altitude.some((v) => v !== 0));
  let hasGPS = $derived(!!detail && detail.lat.some((v) => v !== null));
  // Real per-second speed data - the signal behind the effort tape's pace
  // line and the phase-segmentation strip both being meaningful. Distinct
  // from `detail.distanceKm > 0` (the summary field): a pool swim's summary
  // distance is real (from its length count) but its per-second speed/
  // distance *streams* are effectively empty, so anything derived from that
  // stream (not the summary field) needs this narrower check instead.
  let hasSpeed = $derived(!!detail && detail.speed.some((v) => v > 0));
  let isRunning = $derived(!!detail && sportFamily(detail.sport) === 'running');
  // Cycling's km-tiles show speed (km/h) instead of running-style min/km
  // pace, matching the hero/ledger, which already correctly show cycling
  // as speed - per your call on the logged "per-sport visualization ideas"
  // bug.
  let isCycling = $derived(!!detail && sportFamily(detail.sport) === 'cycling');

  // Real per-second streams for the new "Streams" charts below - 0 in
  // either hr or cadence isn't a real reading (a pause, not-yet-locked-on
  // sensor, or between steps/pedal strokes), matching the same "0 means no
  // reading" contract this app already established for cadence elsewhere
  // (bug-list.md: "Remove any zero SPM values from graphs"). Garmin's
  // Performance Condition is already null when not recorded, and a real 0
  // there is a genuine "performing exactly as expected" reading, not a
  // missing one, so it's passed through unchanged.
  let heartRateStream: (number | null)[] = $derived(detail ? detail.hr.map((v) => (v > 0 ? v : null)) : []);
  let cadenceStream: (number | null)[] = $derived(detail ? detail.cadence.map((v) => (v > 0 ? v : null)) : []);
  let hasHrStream = $derived(!!detail && detail.hr.some((v) => v > 0));
  let hasCadence = $derived(!!detail && detail.cadence.some((v) => v > 0));
  let hasPerfCondition = $derived(!!detail && detail.perfCondition.some((v) => v !== null));
  // "Kilometre by kilometre" only makes sense with real per-lap pace data -
  // false for cardio/indoor sessions with no distance at all, and for pool
  // swims, whose laps carry real HR but no meaningful running-style pace
  // (swims are measured in lengths/100m, not km - see the Tape follow-up
  // logged in bug-list.md for a real swim-specific replacement).
  let showKmTiles = $derived(!!detail && detail.laps.length > 0 && detail.laps.some((l) => l.avgPaceMinPerKm > 0) && sportFamily(detail.sport) !== 'pool-swim');
  // The Route panel has real content only for GPS activities and pool swims
  // with real length data (PoolRouteMap's own schematic) - anything else
  // (cardio, indoor, a pool swim not yet re-parsed) has nothing to show, so
  // the panel is omitted outright rather than rendering an empty "No GPS
  // data" placeholder.
  let showRoutePanel = $derived(hasGPS || isPoolSwimWithLengths);
  // True while the sticky Timeline is actually pinned under the header (its
  // top has reached its own sticky offset and the page is scrolled) -
  // drives the drop shadow that separates it from content scrolling
  // underneath (bug-list.md), without shadowing the page at rest.
  let timelineEl = $state<HTMLDivElement | null>(null);
  let timelineStuck = $state(false);
  $effect(() => {
    const el = timelineEl;
    if (!el) return;
    const update = () => {
      const style = getComputedStyle(el);
      // Not sticky at all on a phone (see .timeline-panel's media query) -
      // it scrolls away with the page, so it's never "pinned", and must not
      // shrink once its top passes the viewport's.
      if (style.position !== 'sticky') {
        timelineStuck = false;
        return;
      }
      const stickyTop = parseFloat(style.top) || 0;
      timelineStuck = window.scrollY > 0 && el.getBoundingClientRect().top <= stickyTop + 0.5;
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      timelineStuck = false;
    };
  });

  // Pinning also shrinks the Timeline by about 35% of its height, animated
  // (chart shorter, phase strip collapsed). A sticky element's height is
  // also its share of the page flow, so shrinking it alone would jump all
  // the content below up by the same amount - and the browser's scroll
  // anchoring could then un-pin it again. So the panel grows a bottom
  // margin by exactly what it loses, on the same transition: its flow
  // footprint stays constant and nothing below moves. Heights are measured
  // at the moment of pinning (CSS can't transition to/from height:auto).
  const TIMELINE_ANIM_MS = 350;
  const TIMELINE_SHRINK = 0.35; // fraction of its height the Timeline gives up while pinned
  let phaseStripEl = $state<HTMLDivElement | null>(null);
  let timelineCompact = $state<{ full: number; delta: number; chartH: number; stripH: number } | null>(null);
  let timelinePanelH = $state<string | null>(null);
  let timelineMarginB = $state<string | null>(null);
  let phaseStripMax = $state<string | null>(null);
  let timelineSettle: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const el = timelineEl;
    const stuck = timelineStuck;
    if (!el) return;
    if (stuck && timelineCompact === null) {
      clearTimeout(timelineSettle);
      const full = el.offsetHeight;
      const stripH = phaseStripEl?.offsetHeight ?? 0;
      const chartFull = (el.querySelector('.effort-tape-box') as HTMLElement | null)?.offsetHeight ?? 0;
      // Remove 35% of the panel: all of the phase strip, the rest from the
      // chart (never below a still-readable minimum, never taller than it
      // already is).
      const chartH = Math.min(chartFull, Math.max(32, Math.round(chartFull - (full * TIMELINE_SHRINK - stripH))));
      const delta = chartFull - chartH + stripH;
      // Pin explicit start values first so the transition has a from-state.
      timelinePanelH = `${full}px`;
      timelineMarginB = '0px';
      phaseStripMax = `${stripH}px`;
      tick().then(() => {
        if (!timelineStuck) return;
        // Force a style flush so the browser registers those start values
        // before the targets below - otherwise height snaps instead of
        // animating (and the page below jumps while the margin catches up).
        void el.offsetHeight;
        timelineCompact = { full, delta, chartH, stripH };
        timelinePanelH = `${full - delta}px`;
        timelineMarginB = `${delta}px`;
        phaseStripMax = '0px';
      });
    } else if (!stuck && timelineCompact !== null) {
      const { full, stripH } = timelineCompact;
      timelineCompact = null;
      timelinePanelH = `${full}px`;
      timelineMarginB = '0px';
      phaseStripMax = `${stripH}px`;
      // Back to natural (auto) sizing once expanded, so later layout
      // changes (resize, another activity) aren't stuck at a measured px.
      timelineSettle = setTimeout(() => {
        if (timelineCompact === null) {
          timelinePanelH = null;
          timelineMarginB = null;
          phaseStripMax = null;
        }
      }, TIMELINE_ANIM_MS + 50);
    }
  });

  let hasTimeInZone = $derived(!!detail && detail.timeInZoneSec.length === 5);
  // Elevation row in Streams: plotted over time (not distance) so it shares
  // the other streams' hover cursor. Still gated on real speed data too -
  // in practice GPS sports (running/cycling), where an elevation profile
  // is actually meaningful rather than indoor barometer drift.
  let showElevationChart = $derived(hasAltitude && hasSpeed);
  let elevationStream: (number | null)[] = $derived(detail ? detail.altitude.map((v) => (v !== 0 ? toDisplayElevation(v, unitSystem) : null)) : []);
  let hasStreams = $derived(hasHrStream || hasCadence || hasPerfCondition || showElevationChart);

  // Pace stream (min/km) derived from the speed stream. Flooring the speed
  // (rather than only special-casing exactly-zero) keeps every sample - not
  // just full stops - from spiking the chart: a near-zero GPS reading would
  // otherwise divide out to an arbitrarily large pace.
  const MAX_DISPLAY_PACE = 20;
  const MIN_DISPLAY_SPEED = 60 / MAX_DISPLAY_PACE;
  let paceStream = $derived(detail ? detail.speed.map((s) => 60 / Math.max(s, MIN_DISPLAY_SPEED)) : []);

  let altitudeRange = $derived(detail && hasAltitude ? altitudeRangeOf(detail.altitude) : null);
  // Elevation chart's labelled min/max: the same trimmed range as the hero's
  // Elevation range (in display units); the line is clamped to it.
  let elevationDomain = $derived(altitudeRange ? { min: toDisplayElevation(altitudeRange.min, unitSystem), max: toDisplayElevation(altitudeRange.max, unitSystem) } : null);

  // Tape's effort-phase caption strip (bug-list.md): a real, deterministic
  // segmentation of this activity's own HR/pace streams - see
  // lib/effort-phases.ts for the heuristic and its documented caveats. []
  // (strip hidden) for anything too short to meaningfully phase-segment, or
  // with no real speed stream at all (cardio, or a pool swim - see hasSpeed)
  // where "steady state: 0.0 km at 20:00" would just be the pace stream's
  // own empty-data fallback value dressed up as a real number. Also hidden
  // for an activity with no real HR at all (e.g. a GPX import, which has no
  // HR field at all) - per your call: the whole heuristic (warm-up end,
  // drift) is HR-driven, so without any real HR it can only ever produce a
  // degenerate result (e.g. "Warm-up drift: HR 0 · pace 20:00") rather than
  // a real segmentation, and there's no real pace-only fallback heuristic
  // built for this - see the bug's own note on that being a bigger,
  // separate, unverified change from this one.
  let effortPhases = $derived(detail && hasSpeed && hasHrStream ? segmentEffortPhases(detail.t, detail.hr, paceStream, detail.distance, detail.hrZoneBoundaries) : []);

  let avgTemp = $derived.by(() => {
    if (!detail) return null;
    const vals = detail.temperature.filter((v) => v !== 0);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  });

  // Tape's Conditions stat: temperature (already real), weather condition
  // word (opt-in lookup, may be unset), and real Garmin RPE - joined with
  // " · " and skipping whichever pieces aren't available, rather than
  // showing empty separators.
  let conditionsText = $derived.by(() => {
    if (!detail) return null;
    const parts: string[] = [];
    if (avgTemp !== null) parts.push(formatTemp(avgTemp, unitSystem));
    if (detail.weatherCondition) parts.push(detail.weatherCondition.toLowerCase());
    if (detail.workoutRpe !== null) parts.push(`RPE ${detail.workoutRpe}`);
    return parts.length > 0 ? parts.join(' · ') : null;
  });

</script>

<div class="screen">
  {#if activityId === null}
    <ActivityFilterBar bind:activityTypes={activityTypeFilter} />
    <div class="panel activities-list-panel">
      {#if allActivities.length === 0}
        <div class="empty-state">No activities yet. Sync your first activity now!</div>
      {:else if sortedActivities.length === 0}
        <div class="empty-state">No activities match this filter.</div>
      {:else}
        <ActivityLedger activities={sortedActivities} {unitSystem} prIds={allPrIds} onSelect={onSelectActivity} {sortKey} {sortDir} onSort={toggleSort} virtual />
      {/if}
    </div>
  {:else if loading || !detail}
    <div class="activity-skeleton">
      <div class="activity-hero-row">
        <div>
          <Skeleton width="140px" height="10.5px" />
          <div class="mt-4"><Skeleton width="220px" height="22px" /></div>
        </div>
        <div class="stat-strip" style="flex-wrap: nowrap;">
          {#each { length: 5 } as _, i (i)}
            <div class="stat-cell stat-cell-narrow">
              <Skeleton width="60px" height="9px" />
              <div class="mt-2"><Skeleton width="50px" height="1.4em" /></div>
            </div>
          {/each}
        </div>
      </div>

      <div class="panel-row-2" style="grid-template-columns: minmax(0,1fr) minmax(0,1.55fr); align-items: stretch;">
        <div class="panel">
          <Skeleton width="160px" height="11px" />
          <div class="mt-4"><SkeletonChart height="290px" /></div>
        </div>
        <div class="panel">
          <Skeleton width="160px" height="11px" />
          <div class="mt-4"><SkeletonChart height="290px" /></div>
        </div>
      </div>

      <div class="panel-row-2 panel-row-2-wide">
        <div class="panel">
          <Skeleton width="180px" height="11px" />
          <div class="mt-4"><SkeletonChart height="140px" /></div>
        </div>
        <div class="panel">
          <Skeleton width="80px" height="11px" />
          <div class="mt-4"><SkeletonRows rows={6} /></div>
        </div>
      </div>

      <div class="panel">
        <Skeleton width="60px" height="11px" />
        <div class="mt-4"><SkeletonRows rows={5} /></div>
      </div>
    </div>
  {:else}
    <button class="back-link mono" onclick={onBack}>‹ All activities</button>
    <div class="tape-view">
      <div class="tape-eyebrow mono">
        {formatSport(detail.sport).toUpperCase()} · {formatDateLong(detail.date).toUpperCase()}{detail.startTimeLabel ? ` · ${detail.startTimeLabel}` : ''}{detail.locationLabel ? ` · ${detail.locationLabel.toUpperCase()}` : ''}
      </div>

      <div class="tape-hero-row">
        <div class="tape-hero-nums">
          <div class="tape-hero-list-cell">
            <span class="tape-hero-num mono">{formatClock(detail.durationMin * 60)}</span><span class="tape-hero-unit">time</span>
          </div>
          {#if heroDistance}
            <div class="tape-hero-num-cell">
              <span class="tape-hero-num mono">{heroDistance.value}</span><span class="tape-hero-unit">{heroDistance.unit}</span>
            </div>
          {/if}
          {#if heroRate}
            <div class="tape-hero-num-cell">
              <span class="tape-hero-num mono accent">{heroRate.value}</span><span class="tape-hero-unit">{heroRate.unit}</span>
            </div>
          {/if}
          {#if detail.avgHR > 0}
            <div class="tape-hero-num-cell">
              <span class="tape-hero-num mono" style="color: var(--alert);">{detail.avgHR}</span><span class="tape-hero-unit">bpm</span>
            </div>
          {/if}
        </div>
        <div class="tape-hero-list mono">
          <div class="tape-hero-list-row"><span>Elapsed</span><span>{formatClock((detail.elapsedDurationMin || detail.durationMin) * 60)}</span></div>
          {#if !isPoolSwim}
            <div class="tape-hero-list-row">
              <span>Ascent</span>
              <span>{detail.ascentM > 0 ? Math.round(toDisplayElevation(detail.ascentM, unitSystem)) : '—'} {elevationUnit(unitSystem)}</span>
            </div>
            {#if altitudeRange}
              <div class="tape-hero-list-row"><span>Elevation range</span><span>{formatElevationRange(altitudeRange.min, altitudeRange.max, unitSystem)}</span></div>
            {/if}
          {/if}
          {#if detail.aerobicTrainingEffect > 0}
            <div class="tape-hero-list-row"><span><InfoLabel text="Aerobic training effect est." tip="Your watch's estimate of how much this session improved your fitness, from 0 to 5. Aerobic is endurance; anaerobic is short, hard efforts." /></span><span>{detail.aerobicTrainingEffect.toFixed(1)} · {trainingEffectLabel(detail.aerobicTrainingEffect)}</span></div>
          {/if}
          {#if conditionsText}
            <div class="tape-hero-list-row"><span>Conditions</span><span>{conditionsText}</span></div>
          {/if}
        </div>
      </div>

      <!-- HR density and time-in-zone are separate panels (bug-list.md),
           stacked in one column beside Stats. -->
      {#snippet hrDensityPanel()}
        <div class="panel">
          <div class="panel-head">
            <span class="panel-label">Heart-rate density</span>
          </div>
          <div class="mt-4">
            <HrDensity hr={detail!.hr} hrZoneBoundaries={detail!.hrZoneBoundaries} />
          </div>
        </div>
      {/snippet}

      {#snippet timeInZonePanel()}
        <div class="panel">
          <div class="panel-head">
            <span class="panel-label">Time in HR Zones</span>
          </div>
          <div class="mt-4">
            <TimeInZones timeInZoneSec={detail!.timeInZoneSec} hrZoneBoundaries={detail!.hrZoneBoundaries} />
          </div>
        </div>
      {/snippet}

      {#if detail.t.length > 0}
        <div class="panel timeline-panel" class:stuck={timelineStuck} class:sizing={timelinePanelH !== null} style:height={timelinePanelH} style:margin-bottom={timelineMarginB} bind:this={timelineEl}>
          <div class="panel-head">
            <span class="panel-label">Timeline{hasHrStream ? ' · bar height & hue = heart rate' : ''}{hasSpeed ? ' · line = pace' : ''}</span>
          </div>
          <div class="mt-4">
            <EffortTape
              t={detail.t}
              hr={detail.hr}
              distance={detail.distance}
              altitude={detail.altitude}
              pace={paceStream}
              hrZoneBoundaries={detail.hrZoneBoundaries}
              {unitSystem}
              formatTime={formatClock}
              {scrubIndex}
              bind:syncSeconds={chartSyncX}
              laps={detail.laps}
              hasDistance={hasSpeed}
              hasHr={hasHrStream}
              highlightLapIndex={showKmTiles ? timelineHighlightLapIndex : null}
              chartHeight={timelineCompact?.chartH ?? null}
            />
            <div class="phase-strip-wrap" bind:this={phaseStripEl} style:max-height={phaseStripMax} class:collapsed={timelineCompact !== null}>
              <EffortPhaseStrip phases={effortPhases} totalDurationSec={detail.durationMin * 60} {unitSystem} />
            </div>
          </div>
        </div>
      {/if}

      {#if showKmTiles}
        <div class="panel">
          <div class="panel-head">
            <InfoLabel class="panel-label" text="Laps" tip="Each tile is one lap: its heart-rate trace, {isCycling ? 'speed' : 'pace'} against your average for the whole activity, and its time in each zone." />
            <span class="panel-meta"
              >each tile: HR trace · current {isCycling ? 'speed' : 'pace'} vs average: {avgPaceMinPerKm > 0
                ? isCycling
                  ? formatSpeed(60 / avgPaceMinPerKm, unitSystem)
                  : formatPace(avgPaceMinPerKm, unitSystem).split(' ')[0]
                : '—'} · zone mix</span
            >
          </div>
          <div class="mt-4">
            <KmTiles
              laps={detail.laps}
              t={detail.t}
              hr={detail.hr}
              hrZoneBoundaries={detail.hrZoneBoundaries}
              {avgPaceMinPerKm}
              {unitSystem}
              {hoveredLapIndex}
              onHoverLap={(i) => (hoveredLapIndex = i)}
              {scrubLapIndex}
              showSpeed={isCycling}
            />
          </div>
        </div>
      {/if}

      {#if isPoolSwimWithLengths}
        <div class="panel">
          <div class="panel-head">
            <InfoLabel class="panel-label" text="Length by length" tip="Each tile is one length: its heart-rate trace, pace per 100 m against your session average, SWOLF (seconds plus strokes for the length, lower is more efficient) and its zone mix. Rest lengths in a row merge into one Rest tile." />
            <span class="panel-meta">each tile: HR trace · current pace vs average: {avgSwimPaceSecPer100 > 0 ? formatSecPer100Bare(avgSwimPaceSecPer100) : '—'} · SWOLF · zone mix</span>
          </div>
          <div class="mt-4">
            <SwimLengthTiles
              lengths={detail.lengths}
              t={detail.t}
              hr={detail.hr}
              hrZoneBoundaries={detail.hrZoneBoundaries}
              poolLengthM={detail.poolLengthM}
              avgPaceSecPer100={avgSwimPaceSecPer100}
              {scrubLengthIndex}
            />
          </div>
        </div>
      {/if}

      <!-- Activity layout (bug-list.md): Route | Streams, then
           Stats | heart rate (density above time in zone). A row with only
           one of its panels (e.g. no route on a cardio session) lets that
           panel span the full width. -->
      {#if showRoutePanel || hasStreams}
        <div class="panel-row-2">
          {#if showRoutePanel}
            <div class="panel">
              <div class="panel-head">
                <span class="panel-label">{isPoolSwimWithLengths ? 'Pool · Coloured by HR zone' : 'Route · Coloured by HR zone'}</span>
                {#if hasGPS && !isPoolSwimWithLengths}
                  <div class="segmented" role="tablist" aria-label="Route view">
                    <button type="button" class:active={routeView === 'plan'} onclick={() => (routeView = 'plan')}>Plan</button>
                    <button type="button" class:active={routeView === 'relief'} onclick={() => (routeView = 'relief')}>Relief</button>
                  </div>
                {/if}
              </div>
              <div class="mt-4 route-map-box">
                {#if isPoolSwimWithLengths}
                  <PoolRouteMap lengths={detail.lengths} t={detail.t} hr={detail.hr} hrZoneBoundaries={detail.hrZoneBoundaries} poolLengthM={detail.poolLengthM} {scrubIndex} />
                {:else if routeView === 'plan'}
                  <PlanRouteMap
                    lat={detail.lat}
                    lon={detail.lon}
                    hr={detail.hr}
                    hrZoneBoundaries={detail.hrZoneBoundaries}
                    {scrubIndex}
                    distance={detail.distance}
                    laps={detail.laps}
                    {hoveredLapIndex}
                    onHoverLap={(i) => (hoveredLapIndex = i)}
                    locationLabel={detail.locationLabel}
                    mapTiles={settingsStore.getMapTilesEnabled()}
                  />
                {:else}
                  <RouteMap
                    lat={detail.lat}
                    lon={detail.lon}
                    hr={detail.hr}
                    altitude={detail.altitude}
                    distance={detail.distance}
                    hrZoneBoundaries={detail.hrZoneBoundaries}
                    {scrubIndex}
                    laps={detail.laps}
                    {hoveredLapIndex}
                    onHoverLap={(i) => (hoveredLapIndex = i)}
                    locationLabel={detail.locationLabel}
                    {unitSystem}
                  />
                {/if}
              </div>
            </div>
          {/if}
          {#if hasStreams}
            <div class="panel">
              <div class="panel-head">
                <span class="panel-label">Streams</span>
              </div>
              <div class="stream-rows mt-4">
                {#if hasHrStream}
                  <div class="stream-row">
                    <span class="stream-row-label mono">Heart rate</span>
                    <StreamChart t={detail.t} values={heartRateStream} formatTime={formatClock} formatValue={(v) => `${Math.round(v)} bpm`} color="var(--alert)" bind:syncSeconds={chartSyncX} />
                  </div>
                {/if}
                {#if hasCadence}
                  <div class="stream-row">
                    <span class="stream-row-label mono">Cadence</span>
                    <StreamChart t={detail.t} values={cadenceStream} formatTime={formatClock} formatValue={(v) => `${Math.round(v)} ${isRunning ? 'spm' : '/min'}`} color="var(--accent)" bind:syncSeconds={chartSyncX} />
                  </div>
                {/if}
                {#if hasPerfCondition}
                  <div class="stream-row">
                    <InfoLabel class="stream-row-label mono" text="Performance condition" tip="Garmin's own real-time estimate of how you're performing relative to your baseline fitness for the current heart rate - positive is better than usual, negative is worse." />
                    <StreamChart t={detail.t} values={detail.perfCondition} formatTime={formatClock} formatValue={(v) => `${v >= 0 ? '+' : ''}${v}`} color="var(--positive)" zeroLine bind:syncSeconds={chartSyncX} />
                  </div>
                {/if}
                {#if showElevationChart}
                  <div class="stream-row">
                    <span class="stream-row-label mono">Elevation</span>
                    <StreamChart t={detail.t} values={elevationStream} domain={elevationDomain} formatTime={formatClock} formatValue={(v) => `${Math.round(v)} ${elevationUnit(unitSystem)}`} color="var(--ink-3)" bind:syncSeconds={chartSyncX} />
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <div class="panel-row-2 panel-row-2-half">
        <SessionRecord {detail} {unitSystem} />
        <div class="hr-stack">
          {@render hrDensityPanel()}
          {#if hasTimeInZone}
            {@render timeInZonePanel()}
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Mirrors .screen's own flex gap - the skeleton is one wrapper div (a
     single child of .screen), so its internal sections need their own
     spacing to match how the real hero-row/panel-row-2/panel siblings are
     spaced once loaded. */
  .activity-skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  /* List view (no activity selected): every imported activity in the same
     table Today's ledger uses, uncapped, filling the full screen height
     instead of sizing to its own content - the header above already carries
     the "Activity" title, so this panel doesn't repeat its own label. */
  .activities-list-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 100px);
  }
  .activities-list-panel :global(.table-wrap) {
    flex: 1;
    overflow-y: auto;
  }
  .back-link {
    align-self: flex-start;
    border: none;
    background: none;
    padding: var(--space-3) var(--space-5) var(--space-3) var(--space-3);
    margin: 0 0 var(--space-2) -6px;
    border-radius: var(--radius-sm);
    font-size: var(--fs-base);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--tracking-wide);
    color: var(--ink-2);
    cursor: pointer;
  }
  .back-link:hover {
    color: var(--accent-ink);
    background: var(--bg-row-hover);
  }

  /* ===== Tape view (bug-list.md) ===== */
  .tape-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }
  .tape-eyebrow {
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    color: var(--ink-5);
  }
  .tape-hero-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-9);
    flex-wrap: wrap;
  }
  .tape-hero-nums {
    display: flex;
    align-items: baseline;
    gap: var(--space-9);
    flex-wrap: wrap;
  }
  .tape-hero-num-cell {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .tape-hero-num {
    font-size: var(--fs-display);
    font-weight: var(--fw-bold);
    line-height: 1;
    color: var(--ink-1);
  }
  .tape-hero-num.accent {
    color: var(--accent-ink);
  }
  .tape-hero-unit {
    font-size: var(--fs-base);
    color: var(--ink-5);
  }
  .tape-hero-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 220px;
  }
  .tape-hero-list-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-8);
    font-size: var(--fs-sm);
  }
  .tape-hero-list-row > span:first-child {
    color: var(--ink-5);
  }
  .tape-hero-list-row > span:last-child {
    color: var(--ink-2);
  }
  @media (max-width: 720px) {
    .tape-hero-num {
      font-size: var(--fs-3xl);
    }
  }

  /* Shared with the loading skeleton above (the only remaining user of this
     class, now that Atlas - which also used it for the real hero row - has
     been removed). */
  .activity-hero-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-8);
    flex-wrap: wrap;
  }
  /* Matches Timeline's own inner box (EffortTape.svelte's .effort-tape) -
     same translucent bordered/blurred container, just holding stacked
     stream rows instead of the HR/pace charts. */
  .stream-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    background: var(--tooltip-bg);
    border: 1px solid var(--line-panel);
    border-radius: var(--radius);
    padding: var(--space-5) var(--space-5) var(--space-4);
    backdrop-filter: blur(2px);
  }
  /* Route now spans the full page width (Stats took its old row-mate's
     place), so the square route/relief maps get a fixed height instead of
     growing with the width into a ~1000px-tall panel. */
  .route-map-box {
    display: flex;
    height: 460px;
  }
  /* panel-row-2 with auto-fill instead of auto-fit: a lone panel keeps its
     one column rather than stretching across the empty second track. Same
     track floor as .panel-row-2, so it still collapses to one full-width
     column when narrow. */
  .hr-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    min-width: 0;
  }
  .panel-row-2-half {
    grid-template-columns: repeat(auto-fill, minmax(min(max(560px, calc(50% - 6px)), 100%), 1fr));
  }
  .stream-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  :global(.stream-row-label) {
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-5);
  }

  /* Timeline stays pinned under the app header while everything below it
     (laps, streams, route/elevation, stats) scrolls past underneath -
     keeps the scrub position visible no matter how far down the page you
     are. Sits below .header's own sticky top:0 (z-index 5). */
  .timeline-panel {
    position: sticky;
    top: var(--header-height);
    z-index: 4;
    transition:
      box-shadow 0.2s ease,
      height 0.35s ease,
      margin-bottom 0.35s ease;
  }
  /* A phone is too short for this: pinned, the Timeline filled over half
     the screen and left laps/streams/stats a thin strip to scroll through.
     There it's an ordinary panel that scrolls away with the page. */
  @media (max-width: 720px) {
    .timeline-panel {
      position: static;
    }
  }
  /* While its height is pinned to a measured value (pinning/unpinning),
     clip rather than let the shrinking contents spill out. */
  .timeline-panel.sizing {
    overflow: hidden;
  }
  .phase-strip-wrap {
    overflow: hidden;
    transition:
      max-height 0.35s ease,
      opacity 0.35s ease;
  }
  .phase-strip-wrap.collapsed {
    opacity: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .timeline-panel,
    .phase-strip-wrap,
    .timeline-panel :global(.effort-tape-box) {
      transition: none;
    }
  }
  /* Only while pinned: a soft shadow below the panel so content scrolling
     underneath reads as passing behind it rather than butting into a hard
     edge. */
  .timeline-panel.stuck {
    box-shadow: 0 16px 28px -6px var(--shadow-sticky);
  }
</style>
