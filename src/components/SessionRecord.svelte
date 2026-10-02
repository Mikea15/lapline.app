<!-- SessionRecord.svelte - Tape's expanded "Session Record" panel
     (bug-list.md): every real Garmin-style per-activity stat this app can
     actually source, grouped the way Garmin Connect's own activity summary
     groups them. Takes one column of a panel-row-2 (paired with HR density
     & zones) and stacks its categories in a single column inside one boxed
     well, one divider-separated row per category. Two things Garmin shows
     that this app genuinely can't source are left out rather than faked,
     and logged as their own
     follow-ups in bug-list.md: a Resting/Active/Net calorie split (needs a
     resting-metabolic-rate input this app doesn't track) and a "Distance
     Category" field (unclear what real data it would even come from). -->
<script lang="ts">
  import RadialGauge from './RadialGauge.svelte';
  import InfoLabel from './InfoLabel.svelte';
  import { sportFamily } from '../lib/sport-color';
  import { formatClock } from '../lib/date-utils';
  import { trainingEffectLabel } from '../lib/training-feel';
  import { formatPace, formatSpeed, toDisplayElevation, elevationUnit, type UnitSystem } from '../lib/units';
  import type { ActivityDetail } from '../lib/types';

  interface Props {
    detail: ActivityDetail;
    unitSystem: UnitSystem;
  }

  let { detail, unitSystem }: Props = $props();

  let family = $derived(sportFamily(detail.sport));
  let isPoolSwim = $derived(family === 'pool-swim');
  let isRunning = $derived(family === 'running');
  let isCycling = $derived(family === 'cycling');

  function cadenceUnit(): string {
    if (isRunning) return 'spm';
    if (isCycling) return 'rpm';
    return '/min';
  }

  let minHR = $derived.by(() => {
    const vals = detail.hr.filter((v) => v > 0);
    return vals.length > 0 ? Math.min(...vals) : 0;
  });

  let hasSpeed = $derived(detail.speed.some((v) => v > 0));

  // Real per-record speed stream, not the device's own auto-pause timer -
  // sums real elapsed-second *gaps* between consecutive samples where the
  // later one reads above a near-stationary threshold (0.5 km/h - excludes
  // GPS/sensor jitter at a dead stop). Deliberately not a per-sample count:
  // this app's own records use the device's "smart recording" (real stub
  // data confirmed gaps up to 10s between consecutive samples, occasionally
  // much larger during a real pause), so the *number* of samples above the
  // threshold isn't the same as the number of real seconds they span.
  let movingTimeSec = $derived.by(() => {
    if (!hasSpeed || detail.t.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < detail.t.length; i++) {
      if (detail.speed[i]! > 0.5) total += detail.t[i]! - detail.t[i - 1]!;
    }
    return total;
  });

  // elapsedDurationMin is undefined on activities imported before this field
  // existed (falls back to durationMin, same contract as sourceFileId).
  let elapsedSec = $derived((detail.elapsedDurationMin || detail.durationMin) * 60);

  let altitudeMinMax = $derived.by(() => {
    if (isPoolSwim) return null;
    const vals = detail.altitude.filter((v) => v !== 0);
    return vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null;
  });

  // Same "500m+ qualifying lap" rule fit-parser.ts's own computeBestPace
  // already uses for the stored bestPaceMinPerKm ("fastest") - computed
  // here rather than stored so it works immediately on already-imported
  // activities with no re-parse needed.
  const MIN_QUALIFYING_LAP_M = 500;
  let worstPaceMinPerKm = $derived.by(() => {
    let worst = 0;
    for (const lap of detail.laps) {
      if (lap.distanceM < MIN_QUALIFYING_LAP_M) continue;
      const pace = lap.elapsedSec / (lap.distanceM / 1000) / 60;
      if (pace > worst) worst = pace;
    }
    return worst;
  });

  let avgPaceMinPerKm = $derived(detail.distanceKm > 0.05 ? detail.durationMin / detail.distanceKm : 0);

  let minSpeedKmh = $derived.by(() => {
    const vals = detail.speed.filter((v) => v > 0);
    return vals.length > 0 ? Math.min(...vals) : 0;
  });

  // This app's own real per-activity definition, built from real
  // timeInZoneSec - not Garmin's official Intensity Minutes, which weighs
  // moderate/vigorous differently and accumulates weekly across activities
  // rather than per-session (disclosed via the InfoLabel below). Moderate
  // = Z3 minutes, Vigorous = Z4+Z5 minutes (this app's pre-existing
  // "Intensity min" figure).
  let moderateMinutes = $derived(detail.timeInZoneSec.length === 5 ? Math.round(detail.timeInZoneSec[2]! / 60) : 0);
  let vigorousMinutes = $derived(detail.timeInZoneSec.length === 5 ? Math.round((detail.timeInZoneSec[3]! + detail.timeInZoneSec[4]!) / 60) : 0);
  let totalIntensityMinutes = $derived(moderateMinutes + vigorousMinutes);
</script>

<div class="panel">
  <div class="panel-head">
    <span class="panel-label">Stats</span>
  </div>

  <div class="sr-body mt-4">
    {#if detail.aerobicTrainingEffect > 0 || detail.anaerobicTrainingEffect > 0}
      <section class="sr-section">
        <h3 class="sr-heading"><InfoLabel text="Training effect (est.)" tip="Your watch's estimate of how much this session improved your fitness, from 0 to 5. Aerobic is endurance; anaerobic is short, hard efforts." /></h3>
        <div class="sr-gauges">
          <RadialGauge value={detail.aerobicTrainingEffect} valueLabel={detail.aerobicTrainingEffect.toFixed(1)} label="Aerobic" sublabel={trainingEffectLabel(detail.aerobicTrainingEffect)} color="var(--accent)" />
          <RadialGauge value={detail.anaerobicTrainingEffect} valueLabel={detail.anaerobicTrainingEffect.toFixed(1)} label="Anaerobic" sublabel={trainingEffectLabel(detail.anaerobicTrainingEffect)} color="var(--alert)" />
        </div>
      </section>
    {/if}

    <section class="sr-section">
      <h3 class="sr-heading">Timing</h3>
      <div class="meta-grid">
        <div class="meta-item"><span class="meta-label">Time trained</span><span class="meta-value mono">{formatClock(detail.durationMin * 60)}</span></div>
        {#if movingTimeSec > 0}
          <div class="meta-item">
            <InfoLabel class="meta-label" text="Moving time" tip="Time you were actually moving. Stops at lights or water breaks don't count." />
            <span class="meta-value mono">{formatClock(movingTimeSec)}</span>
          </div>
        {/if}
        <div class="meta-item"><span class="meta-label">Elapsed</span><span class="meta-value mono">{formatClock(elapsedSec)}</span></div>
      </div>
    </section>

    {#if detail.avgHR > 0}
      <section class="sr-section">
        <h3 class="sr-heading">Heart rate</h3>
        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">Average</span><span class="meta-value mono">{detail.avgHR} bpm</span></div>
          {#if detail.maxHR > 0}<div class="meta-item"><span class="meta-label">Max</span><span class="meta-value mono">{detail.maxHR} bpm</span></div>{/if}
          {#if minHR > 0}<div class="meta-item"><span class="meta-label">Min</span><span class="meta-value mono">{minHR} bpm</span></div>{/if}
        </div>
      </section>
    {/if}

    {#if !isPoolSwim && (detail.ascentM > 0 || detail.descentM > 0 || altitudeMinMax)}
      <section class="sr-section">
        <h3 class="sr-heading">Elevation</h3>
        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">Ascent</span><span class="meta-value mono">{Math.round(toDisplayElevation(detail.ascentM, unitSystem))} {elevationUnit(unitSystem)}</span></div>
          <div class="meta-item"><span class="meta-label">Descent</span><span class="meta-value mono">{Math.round(toDisplayElevation(detail.descentM, unitSystem))} {elevationUnit(unitSystem)}</span></div>
          {#if altitudeMinMax}
            <div class="meta-item"><span class="meta-label">Min elev.</span><span class="meta-value mono">{Math.round(toDisplayElevation(altitudeMinMax.min, unitSystem))} {elevationUnit(unitSystem)}</span></div>
            <div class="meta-item"><span class="meta-label">Max elev.</span><span class="meta-value mono">{Math.round(toDisplayElevation(altitudeMinMax.max, unitSystem))} {elevationUnit(unitSystem)}</span></div>
          {/if}
        </div>
      </section>
    {/if}

    {#if isRunning && avgPaceMinPerKm > 0}
      <section class="sr-section">
        <h3 class="sr-heading">Pace</h3>
        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">Average</span><span class="meta-value mono">{formatPace(avgPaceMinPerKm, unitSystem)}</span></div>
          {#if detail.bestPaceMinPerKm > 0}<div class="meta-item"><span class="meta-label">Max (fastest)</span><span class="meta-value mono">{formatPace(detail.bestPaceMinPerKm, unitSystem)}</span></div>{/if}
          {#if worstPaceMinPerKm > 0}<div class="meta-item"><span class="meta-label">Min (slowest)</span><span class="meta-value mono">{formatPace(worstPaceMinPerKm, unitSystem)}</span></div>{/if}
        </div>
      </section>
    {/if}

    {#if isCycling && detail.avgSpeedKmh > 0}
      <section class="sr-section">
        <h3 class="sr-heading">Speed</h3>
        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">Average</span><span class="meta-value mono">{formatSpeed(detail.avgSpeedKmh, unitSystem)}</span></div>
          {#if detail.maxSpeedKmh > 0}<div class="meta-item"><span class="meta-label">Max</span><span class="meta-value mono">{formatSpeed(detail.maxSpeedKmh, unitSystem)}</span></div>{/if}
          {#if minSpeedKmh > 0}<div class="meta-item"><span class="meta-label">Min</span><span class="meta-value mono">{formatSpeed(minSpeedKmh, unitSystem)}</span></div>{/if}
        </div>
      </section>
    {/if}

    {#if isRunning && (detail.avgCadence > 0 || detail.avgStrideLengthM > 0)}
      <section class="sr-section">
        <h3 class="sr-heading">Running dynamics</h3>
        <div class="meta-grid">
          {#if detail.avgCadence > 0}<div class="meta-item"><span class="meta-label">Avg cadence</span><span class="meta-value mono">{detail.avgCadence} {cadenceUnit()}</span></div>{/if}
          {#if detail.maxCadence > 0}<div class="meta-item"><span class="meta-label">Max cadence</span><span class="meta-value mono">{detail.maxCadence} {cadenceUnit()}</span></div>{/if}
          {#if detail.avgStrideLengthM > 0}<div class="meta-item"><span class="meta-label">Avg stride</span><span class="meta-value mono">{detail.avgStrideLengthM.toFixed(2)} m</span></div>{/if}
        </div>
      </section>
    {:else if !isRunning && detail.avgCadence > 0}
      <section class="sr-section">
        <h3 class="sr-heading">Cadence</h3>
        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">Average</span><span class="meta-value mono">{detail.avgCadence} {cadenceUnit()}</span></div>
          {#if detail.maxCadence > 0}<div class="meta-item"><span class="meta-label">Max</span><span class="meta-value mono">{detail.maxCadence} {cadenceUnit()}</span></div>{/if}
        </div>
      </section>
    {/if}

    {#if totalIntensityMinutes > 0}
      <section class="sr-section">
        <h3 class="sr-heading">
          <InfoLabel text="Intensity minutes" tip="Minutes in zone 3 (moderate) and zones 4-5 (vigorous) in this session, counted by Lapline from your heart-rate zones." />
        </h3>
        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">Moderate</span><span class="meta-value mono">{moderateMinutes}</span></div>
          <div class="meta-item"><span class="meta-label">Vigorous</span><span class="meta-value mono">{vigorousMinutes}</span></div>
          <div class="meta-item"><span class="meta-label">Total</span><span class="meta-value mono">{totalIntensityMinutes}</span></div>
        </div>
      </section>
    {/if}

    {#if detail.calories > 0 || detail.sweatLossMl > 0}
      <section class="sr-section">
        <h3 class="sr-heading">Nutrition &amp; Hydration</h3>
        <div class="meta-grid">
          {#if detail.calories > 0}
            <div class="meta-item">
              <InfoLabel class="meta-label" text="Calories" tip="Total calories burned, the device's own on-device estimate. A resting / active / net split isn't shown - this app doesn't track a resting metabolic rate to compute one from." />
              <span class="meta-value mono">{detail.calories} kcal</span>
            </div>
          {/if}
          {#if detail.sweatLossMl > 0}<div class="meta-item"><span class="meta-label">Sweat loss (est.)</span><span class="meta-value mono">{detail.sweatLossMl} ml</span></div>{/if}
        </div>
      </section>
    {/if}

    {#if detail.recoveryHrBpm > 0 || detail.recoveryTimeHours > 0 || detail.garminVo2Max > 0}
      <section class="sr-section">
        <h3 class="sr-heading">Recovery</h3>
        <div class="meta-grid">
          {#if detail.recoveryHrBpm > 0}<div class="meta-item"><span class="meta-label">Recovery HR</span><span class="meta-value mono">{detail.recoveryHrBpm} bpm</span></div>{/if}
          {#if detail.recoveryTimeHours > 0}<div class="meta-item"><span class="meta-label">Recovery time (est.)</span><span class="meta-value mono">{detail.recoveryTimeHours} h</span></div>{/if}
          {#if detail.garminVo2Max > 0}<div class="meta-item"><span class="meta-label">VO₂ max (watch est.)</span><span class="meta-value mono">{detail.garminVo2Max}</span></div>{/if}
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  /* One boxed well (same treatment as Streams' .stream-rows / Timeline's
     .effort-tape), categories stacked in a single column and separated by
     hairline dividers rather than a ragged grid of separate cards. */
  .sr-body {
    display: flex;
    flex-direction: column;
    background: var(--tooltip-bg);
    border: 1px solid var(--line-panel);
    border-radius: var(--radius);
    padding: var(--space-2) var(--space-7);
  }
  .sr-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-6) 0;
  }
  .sr-section + .sr-section {
    border-top: 1px solid var(--line-soft);
  }
  .sr-heading {
    margin: 0;
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-4);
  }
  /* Aerobic/Anaerobic always side by side, each taking half the row. */
  .sr-gauges {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-6);
  }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    row-gap: var(--space-6);
    column-gap: var(--space-6);
  }
  .meta-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  :global(.meta-label) {
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-6);
  }
  .meta-value {
    font-family: var(--font-mono);
    color: var(--ink-1);
    font-size: var(--fs-lg);
    white-space: nowrap;
  }

  @media (max-width: 480px) {
    .meta-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
