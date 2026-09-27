import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseGPX } from '../gpx-parser';

// Anonymised copies of real recordings (scripts/demo/make-test-fixtures.ts):
// same names, dates and metrics as the originals, positions moved.
const STUB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures');

function loadStub(name: string): string {
  return readFileSync(path.join(STUB_DIR, name), 'utf8');
}

describe('parseGPX against real Strava-exported stub files', () => {
  // Confirmed via direct inspection: 2951 real <trkpt> points, 2020-08-16
  // 10:22:45Z to 11:12:46Z (2999s wall span), type "running".
  it('parses a real GPX track into a running activity with GPS, distance, and pace data', () => {
    const [activity] = parseGPX(loadStub('3920815460.gpx'));
    expect(activity).toBeDefined();
    expect(activity!.activity.date).toBe('2020-08-16');
    expect(activity!.activity.sport).toBe('running');
    expect(activity!.activity.startTimeLabel).not.toBe('');
    // Real elapsed wall time from the file's own first/last <time>.
    expect(Math.round(activity!.activity.durationMin)).toBe(50);
    expect(activity!.activity.elapsedDurationMin).toBe(activity!.activity.durationMin);
    // Real distance should be a plausible run, not zero or absurd.
    expect(activity!.activity.distanceKm).toBeGreaterThan(5);
    expect(activity!.activity.distanceKm).toBeLessThan(15);
    expect(activity!.activity.avgSpeedKmh).toBeGreaterThan(0);
    // GPX has no HR/cadence/power field at all - these stub files carry no
    // device extension either, so all three should read as "not recorded",
    // not a guessed value.
    expect(activity!.activity.avgHR).toBe(0);
    expect(activity!.activity.avgCadence).toBe(0);
    expect(activity!.records.every((r) => r.power === 0)).toBe(true);
    expect(activity!.records.every((r) => r.hr === 0)).toBe(true);

    // Real GPS fix on every record.
    expect(activity!.records.length).toBeGreaterThan(2000);
    expect(activity!.records.every((r) => r.lat !== null && r.lon !== null)).toBe(true);
    // Cumulative distance stream should be real and monotonically non-decreasing.
    for (let i = 1; i < activity!.records.length; i++) {
      expect(activity!.records[i]!.distance).toBeGreaterThanOrEqual(activity!.records[i - 1]!.distance);
    }
  });

  it('synthesizes real 1km auto-laps from the cumulative distance stream, feeding a real bestPace', () => {
    const [activity] = parseGPX(loadStub('3920815460.gpx'));
    expect(activity!.laps.length).toBeGreaterThan(5);
    // Every full lap should be a real ~1000m split (allowing the final
    // partial lap to be shorter, and a little slop either side since each
    // lap boundary lands on whichever real GPS point first crosses the
    // 1km-from-start threshold, not exactly on it).
    for (const lap of activity!.laps.slice(0, -1)) {
      expect(lap.distanceM).toBeGreaterThan(900);
      expect(lap.distanceM).toBeLessThan(1100);
    }
    expect(activity!.activity.bestPaceMinPerKm).toBeGreaterThan(0);
  });

  it('parses every real GPX fixture without throwing', () => {
    const files = readdirSync(STUB_DIR).filter((f) => f.endsWith('.gpx'));
    expect(files.length).toBeGreaterThan(1);
    for (const name of files) {
      const activities = parseGPX(loadStub(name));
      expect(activities.length).toBe(1);
      expect(activities[0]!.activity.distanceKm).toBeGreaterThan(0);
      expect(activities[0]!.activity.sport).toBe('running');
    }
  });

  it('returns no activities for a file with no track points (not a workout)', () => {
    const activities = parseGPX('<?xml version="1.0"?><gpx><metadata><time>2024-01-01T00:00:00Z</time></metadata></gpx>');
    expect(activities).toEqual([]);
  });

  it('reads a real Garmin-style TrackPointExtension (hr/cad/atemp) when present, regardless of namespace prefix', () => {
    const gpx = `<?xml version="1.0"?>
<gpx>
 <trk>
  <name>Test</name>
  <type>running</type>
  <trkseg>
   <trkpt lat="52.36" lon="4.87">
    <ele>10</ele>
    <time>2024-01-01T10:00:00Z</time>
    <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr><gpxtpx:cad>80</gpxtpx:cad><gpxtpx:atemp>18</gpxtpx:atemp></gpxtpx:TrackPointExtension></extensions>
   </trkpt>
   <trkpt lat="52.361" lon="4.871">
    <ele>11</ele>
    <time>2024-01-01T10:00:10Z</time>
    <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr><gpxtpx:cad>82</gpxtpx:cad><gpxtpx:atemp>18</gpxtpx:atemp></gpxtpx:TrackPointExtension></extensions>
   </trkpt>
  </trkseg>
 </trk>
</gpx>`;
    const [activity] = parseGPX(gpx);
    expect(activity).toBeDefined();
    expect(activity!.records[0]!.hr).toBe(140);
    expect(activity!.records[1]!.hr).toBe(150);
    expect(activity!.records[0]!.cadence).toBe(80);
    expect(activity!.records[0]!.temp).toBe(18);
    expect(activity!.activity.avgHR).toBe(145);
    expect(activity!.activity.maxHR).toBe(150);
  });
});
