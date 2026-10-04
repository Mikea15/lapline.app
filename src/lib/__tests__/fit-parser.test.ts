import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseFIT, sanitizeAltitudeSpikes } from '../fit-parser';

// Anonymised copies of real recordings (scripts/demo/make-test-fixtures.ts):
// the originals' sports and device metrics, but GPS routes trimmed and
// moved and dates shifted by a secret number of days.
const STUB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures');

function loadStub(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(STUB_DIR, name)));
}

describe('parseFIT cadence correction', () => {
  // Garmin's raw FIT cadence for running records counts one leg only, so
  // real files come in reading roughly half true cadence - this project's
  // own stub data was confirmed at avg_cadence=75 (raw) for recreational-
  // pace runs where true cadence should be ~150-160 spm.
  it('doubles avg/max cadence and the per-record cadence stream for running activities', async () => {
    const [activity] = await parseFIT(loadStub('run-easy.fit'));
    expect(activity).toBeDefined();
    expect(activity!.activity.sport.toLowerCase()).toContain('run');
    // Raw FIT avg_cadence/max_cadence were confirmed at 75/79 via direct inspection.
    expect(activity!.activity.avgCadence).toBe(150);
    expect(activity!.activity.maxCadence).toBe(158);

    const cadenceSamples = activity!.records.map((r) => r.cadence).filter((c) => c > 0);
    expect(cadenceSamples.length).toBeGreaterThan(0);
    // Every non-zero sample should be an even number - proof of the *2 correction
    // rather than a coincidental raw reading.
    for (const c of cadenceSamples) expect(c % 2).toBe(0);
  });

  it('leaves non-running activities (e.g. cardio training) uncorrected', async () => {
    const [activity] = await parseFIT(loadStub('cardio-1.fit'));
    expect(activity).toBeDefined();
    expect(activity!.activity.sport.toLowerCase()).not.toContain('run');
    // This stub has no cadence data at all - avgCadence should stay 0, not
    // become some doubled artifact of a missing field.
    expect(activity!.activity.avgCadence).toBe(0);
  });
});

describe('parseFIT custom activity profile names', () => {
  // Confirmed via direct inspection of this real stub file: session.sport
  // and session.sub_sport are both the FIT "generic" placeholder, but
  // session.sport_profile_name ("Bouldering", also mirrored in the file's
  // top-level `sports` message table) carries the watch's real
  // user-configured activity name for a custom profile FIT has no
  // dedicated sport enum value for.
  it('uses a real sport_profile_name over the FIT generic/generic placeholder', async () => {
    const [activity] = await parseFIT(loadStub('bouldering.fit'));
    expect(activity).toBeDefined();
    expect(activity!.activity.sport).toBe('Bouldering');
  });

  // Confirmed via direct inspection of this real stub file: session.sport is
  // the real, specific "running" (not generic), but session.sport_profile_name
  // is "Footy" - the watch's own running-based profile for a different real
  // activity (Australian Rules Football) entirely. Losing that name (as the
  // sport-is-already-specific short-circuit did before this fix) mislabels a
  // real "Footy" session as an indistinguishable "Running" one.
  it('appends a real, distinctive sport_profile_name onto an already-specific sport', async () => {
    const [activity] = await parseFIT(loadStub('footy.fit'));
    expect(activity).toBeDefined();
    expect(activity!.activity.sport).toBe('running (Footy)');
  });

  // A device's own default profile name ("Run" for a plain running
  // profile) just restates the sport FIT already gave us and shouldn't be
  // appended - only a real, distinctive rename like "Footy" above should be.
  it('does not append a profile name that is just the sport family\'s own default label', async () => {
    const [activity] = await parseFIT(loadStub('run-easy.fit'));
    expect(activity).toBeDefined();
    expect(activity!.activity.sport).toBe('running');
  });
});

describe('parseFIT fit-file-parser v5 fields', () => {
  // fit-file-parser v5 decodes time_in_zone's reference_mesg to its SDK name
  // ('session'/'lap') instead of v4's raw numeric FIT enum (18/19) - a filter
  // still matching on the old numeric value would silently find zero session
  // zone entries and every activity's zone data would regress to empty.
  it('still finds real HR zone data on a stub file known to have it', async () => {
    const [activity] = await parseFIT(loadStub('run-long.fit'));
    expect(activity).toBeDefined();
    expect(activity!.activity.timeInZoneSec).toHaveLength(5);
    expect(activity!.activity.hrZoneBoundaries).toHaveLength(5);
    expect(activity!.activity.timeInZoneSec.some((v) => v > 0)).toBe(true);
  });

  // fit-file-parser v5 reads workout_rpe at 10x its real scale (40 instead
  // of the real RPE of 4, confirmed against this file's matching Garmin
  // Connect entry) - guards against a future library bump silently
  // reintroducing that 10x error in a value shown directly to the user.
  it('scales workout_rpe down to its real 0-10 value', async () => {
    const [activity] = await parseFIT(loadStub('run-long.fit'));
    expect(activity).toBeDefined();
    expect(activity!.activity.workoutRpe).toBe(4);
  });
});

describe('parseFIT start instant', () => {
  // session.start_time confirmed at 2025-09-16T17:42:14Z via direct inspection.
  it('stores the session start as a UTC ISO instant alongside the UTC date', async () => {
    const [activity] = await parseFIT(loadStub('run-easy.fit'));
    expect(activity!.activity.startUtc).toBe('2025-09-16T17:42:14.000Z');
    expect(activity!.activity.date).toBe('2025-09-16');
  });
});

describe('parseFIT Garmin on-device VO2max / recovery time', () => {
  // The FIT `activity_metrics` message (previously unparsed) carries
  // Garmin/Firstbeat's own on-device VO2max and recovery-time estimates -
  // confirmed real and effort-proportional across every one of this
  // project's stub files, not just this one.
  it('reads the real on-device VO2max and recovery time from a stub file known to have them', async () => {
    const [activity] = await parseFIT(loadStub('run-long.fit'));
    expect(activity).toBeDefined();
    // Raw vo2_max was confirmed at 46.09526... via direct inspection.
    expect(activity!.activity.garminVo2Max).toBe(46.1);
    // Raw recovery_time was confirmed at 4373 (minutes) via direct
    // inspection; this app stores it converted to whole hours.
    expect(activity!.activity.recoveryTimeHours).toBe(73);
  });

  it('reads 0 for both on a sport activity_metrics does not compute VO2max for', async () => {
    const [activity] = await parseFIT(loadStub('cardio-1.fit'));
    expect(activity).toBeDefined();
    expect(activity!.activity.sport.toLowerCase()).not.toContain('run');
    expect(activity!.activity.garminVo2Max).toBe(0);
  });
});

describe('parseFIT swim lengths', () => {
  it('parses to an empty lengths array and poolLengthM 0 for a non-swim activity', async () => {
    const [activity] = await parseFIT(loadStub('run-easy.fit'));
    expect(activity).toBeDefined();
    expect(activity!.lengths).toEqual([]);
    expect(activity!.activity.poolLengthM).toBe(0);
    // swimActiveDurationMin should stay genuinely absent (not e.g. 0) for a
    // non-swim activity, so rateSortValue() can fall back correctly.
    expect(activity!.activity.swimActiveDurationMin).toBeUndefined();
  });

  // Real 484m/22m-pool/30-length stub swim - confirmed by dumping the raw
  // file directly: 22 real active lengths (757.001s total) and 8 real
  // merged-rest lengths (522.273s total), against a real total_timer_time
  // of 1279.272s - i.e. real rest is ~41% of the session's own elapsed
  // time, which is exactly the gap swimActiveDurationMin exists to exclude.
  it('parses real pool-swim length data and computes real active-only swim time', async () => {
    const [activity] = await parseFIT(loadStub('pool-swim-2.fit'));
    expect(activity).toBeDefined();
    expect(activity!.activity.poolLengthM).toBe(22);
    expect(activity!.lengths.length).toBe(30);
    expect(activity!.lengths.filter((l) => l.active).length).toBe(22);
    expect(activity!.lengths.filter((l) => !l.active).length).toBe(8);
    expect(activity!.activity.swimActiveDurationMin).toBeCloseTo(757.001 / 60, 2);
    // Real, substantially shorter than the elapsed session duration (which
    // includes the real ~522s/8.7min of rest) - proof this is actually
    // excluding rest, not just echoing durationMin back.
    expect(activity!.activity.swimActiveDurationMin!).toBeLessThan(activity!.activity.durationMin);
  });
});

describe('sanitizeAltitudeSpikes', () => {
  function withAltitude(altitudes: number[]) {
    return altitudes.map((altitude, t) => ({ t, altitude }));
  }

  it('replaces an isolated single-sample spike with its neighbours\' interpolated value', () => {
    const records = withAltitude([44, 45, 46, -45, 47, 48, 49]);
    const cleaned = sanitizeAltitudeSpikes(records);
    // Neighbours are 46 (t=2) and 47 (t=4); the spike sits exactly halfway.
    expect(cleaned[3]).toBeCloseTo(46.5, 1);
    // Everything else is untouched.
    expect(cleaned).toEqual([44, 45, 46, cleaned[3], 47, 48, 49]);
  });

  it('leaves a real, gradual climb alone even though every sample changes', () => {
    const records = withAltitude([10, 12, 14, 16, 18, 20, 22]);
    expect(sanitizeAltitudeSpikes(records)).toEqual([10, 12, 14, 16, 18, 20, 22]);
  });

  it('leaves genuinely-missing (0) readings as 0, not "fixed"', () => {
    const records = withAltitude([50, 0, 0, 52, 53]);
    expect(sanitizeAltitudeSpikes(records)).toEqual([50, 0, 0, 52, 53]);
  });

  it('cannot fix a spike at the very start or end (no neighbour on one side) and leaves it as-is', () => {
    const records = withAltitude([-45, 46, 47, 48, 49]);
    expect(sanitizeAltitudeSpikes(records)[0]).toBe(-45);
  });

  it('does not flag a real, fast-but-plausible single-sample change (below the vertical-rate threshold)', () => {
    // 3m in 1s (~3 m/s) - below the 5 m/s guard, and below the 15m absolute
    // deviation guard, so this should never be touched even in isolation.
    const records = withAltitude([40, 41, 44, 42, 43]);
    expect(sanitizeAltitudeSpikes(records)).toEqual([40, 41, 44, 42, 43]);
  });
});
