import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { anonymiseFit, anonymiseGpx, shiftGpxDays, secretRandom, makeDisguise, TARGET, type Disguise } from '../../../scripts/demo/anonymise';
import { parseFIT } from '../fit-parser';
import { parseGPX } from '../gpx-parser';
import { rewriteFit } from '../fit-rewrite';

// The publishing script (scripts/demo/anonymise.ts), run here on the already
// published samples - the private recordings it's meant for aren't in the
// public repo.
const DEMO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../public/demo');
const load = (name: string) => new Uint8Array(readFileSync(path.join(DEMO_DIR, name)));

const DISGUISE: Disguise = { rotateDeg: 90, centre: { lat: 52.36, lon: 4.88 }, lowestAltM: 10, trimStartM: 500, trimEndM: 600 };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

describe('secret randomness', () => {
  it('is repeatable for one seed and key, and differs across keys and seeds', () => {
    const a = secretRandom('seed-one'.repeat(4), 'route:x');
    const b = secretRandom('seed-one'.repeat(4), 'route:x');
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect(secretRandom('seed-one'.repeat(4), 'route:y')()).not.toBe(seqA[0]);
    expect(secretRandom('seed-two'.repeat(4), 'route:x')()).not.toBe(seqA[0]);
    for (const v of seqA) expect(v >= 0 && v < 1).toBe(true);
  });

  it('places each route within a few km of TARGET with a ~500 m trim', () => {
    for (const key of ['a', 'b', 'c', 'd']) {
      const d = makeDisguise(secretRandom('s'.repeat(32), key));
      const km = metres(d.centre, TARGET) / 1000;
      expect(km).toBeGreaterThanOrEqual(0.49);
      expect(km).toBeLessThanOrEqual(3.01);
      expect(d.trimStartM).toBeGreaterThanOrEqual(450);
      expect(d.trimEndM).toBeLessThanOrEqual(650);
      expect(d.lowestAltM).toBeGreaterThan(0);
    }
  });
});

describe('anonymiseFit', () => {
  it('trims both ends of a GPS route and keeps time, distance, laps and zones consistent', async () => {
    const input = load('sample-run-long.fit');
    const [a] = await parseFIT(input);
    const [b] = await parseFIT(anonymiseFit(input, DISGUISE).bytes);
    const before = a!.activity;
    const after = b!.activity;

    // About 1.1 km shorter, and shorter in time to match.
    expect(before.distanceKm - after.distanceKm).toBeGreaterThan(1.1);
    expect(before.distanceKm - after.distanceKm).toBeLessThan(1.2);
    expect(after.durationMin).toBeLessThan(before.durationMin - 5);
    expect(after.avgSpeedKmh).toBeCloseTo((after.distanceKm / after.durationMin) * 60, 1);

    // Records start at 0 m / 0 s and end where the session does.
    const recs = b!.records;
    expect(recs[0]!.t).toBe(0);
    expect(recs[0]!.distance).toBe(0);
    expect(recs[recs.length - 1]!.distance / 1000).toBeCloseTo(after.distanceKm, 2);
    expect(Math.abs(recs[recs.length - 1]!.t - after.elapsedDurationMin! * 60)).toBeLessThan(2);

    // Laps still add up to the session.
    expect(sum(b!.laps.map((l) => l.distanceM)) / 1000).toBeCloseTo(after.distanceKm, 2);
    expect(sum(b!.laps.map((l) => l.elapsedSec)) / 60).toBeCloseTo(after.elapsedDurationMin!, 1);
    // ...and so do the HR zones (zones 1-5; the rest is below/above them).
    expect(sum(after.timeInZoneSec)).toBeLessThanOrEqual(after.durationMin * 60 + 1);
    expect(sum(after.timeInZoneSec)).toBeLessThan(sum(before.timeInZoneSec));

    // Moved: the trimmed route is centred on the disguise's centre, its lowest point at its altitude.
    const pts = recs.filter((r) => r.lat !== null && r.lon !== null).map((r) => ({ lat: r.lat!, lon: r.lon! }));
    const lats = pts.map((p) => p.lat);
    const lons = pts.map((p) => p.lon);
    const centre = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 };
    expect(metres(centre, DISGUISE.centre)).toBeLessThan(5);
    expect(Math.min(...recs.map((r) => r.altitude).filter((v) => v !== 0))).toBeCloseTo(DISGUISE.lowestAltM, 0);

    // Device metrics are untouched.
    expect(after.avgHR).toBe(before.avgHR);
    expect(after.sport).toBe(before.sport);
  });

  it('keeps every kept record at its own time and distance step, so trimming adds no jumps', async () => {
    // Only the start moves: each record's time and distance since the previous one stay as recorded.
    const [a] = await parseFIT(load('sample-run-steady.fit'));
    const [b] = await parseFIT(anonymiseFit(load('sample-run-steady.fit'), DISGUISE).bytes);
    const src = a!.records;
    const out = b!.records;
    // The first kept record: the first one ~500 m (DISGUISE.trimStartM) in.
    const first = src.findIndex((r) => r.distance - src[0]!.distance >= DISGUISE.trimStartM);
    expect(first).toBeGreaterThan(0);
    expect(out[0]!.distance).toBe(0);
    expect(out.length).toBeGreaterThan(src.length / 2);
    for (let j = 1; j < out.length; j++) {
      const i = first + j;
      expect(out[j]!.t - out[j - 1]!.t).toBe(src[i]!.t - src[i - 1]!.t);
      expect(out[j]!.distance - out[j - 1]!.distance).toBeCloseTo(src[i]!.distance - src[i - 1]!.distance, 6);
    }
  });

  it('clears the local timestamp (it gives away the time zone) and keeps the file id blank', () => {
    const out = anonymiseFit(load('sample-ride.fit'), DISGUISE).bytes;
    rewriteFit(out, {
      edit(m) {
        if (m.global === 34) expect(m.get(5)).toBeNull();
        if (m.global === 0) expect(m.get(3)).toBeNull();
      }
    });
  });

  it('clears, never keeps, positions near the real start or finish - even when that is all of them', async () => {
    // The whole route squeezed into a few metres around its start, as if run on the spot.
    const pairs: Record<number, [number, number][]> = { 20: [[0, 1]], 19: [[3, 4], [5, 6]], 18: [[3, 4], [38, 39]] };
    let origin: [number, number] | null = null;
    const onTheSpot = rewriteFit(load('sample-run-long.fit'), {
      edit(m) {
        for (const [la, lo] of pairs[m.global] ?? []) {
          const lat = m.get(la);
          const lon = m.get(lo);
          if (lat === null || lon === null) continue;
          origin ??= [lat, lon];
          m.set(la, Math.round(origin[0] + (lat - origin[0]) / 1000));
          m.set(lo, Math.round(origin[1] + (lon - origin[1]) / 1000));
        }
      }
    });
    const out = anonymiseFit(onTheSpot, DISGUISE).bytes;
    const [b] = await parseFIT(out);
    expect(b!.records.length).toBeGreaterThan(0);
    expect(b!.records.every((r) => r.lat === null && r.lon === null)).toBe(true);
    rewriteFit(out, {
      edit(m) {
        for (const [la] of pairs[m.global] ?? []) expect(m.get(la)).toBeNull();
      }
    });
  });

  it('leaves a session without GPS whole', async () => {
    const input = load('sample-pool-swim.fit');
    const [a] = await parseFIT(input);
    const [b] = await parseFIT(anonymiseFit(input, DISGUISE).bytes);
    expect(b!.activity.distanceKm).toBe(a!.activity.distanceKm);
    expect(b!.activity.durationMin).toBe(a!.activity.durationMin);
    expect(b!.lengths.length).toBe(a!.lengths.length);
  });
});

describe('anonymiseGpx', () => {
  // A 3 km straight line, one point every 10 m and 3 s.
  const start = Date.UTC(2024, 4, 1, 7, 30, 0);
  const points = Array.from({ length: 301 }, (_, i) => {
    const lat = 40 + (i * 10) / 111_195;
    const time = new Date(start + i * 3000).toISOString().replace('.000Z', 'Z');
    return `   <trkpt lat="${lat.toFixed(7)}" lon="-3.0000000">\n    <ele>${(600 + i / 10).toFixed(1)}</ele>\n    <time>${time}</time>\n   </trkpt>`;
  });
  const gpx = `<?xml version="1.0"?>\n<gpx creator="Some Watch" version="1.1">\n <metadata>\n  <time>2024-05-01T07:29:00Z</time>\n </metadata>\n <trk>\n  <type>running</type>\n  <trkseg>\n${points.join('\n')}\n  </trkseg>\n </trk>\n</gpx>\n`;

  it('trims both ends, moves the route and offsets elevation', () => {
    const out = anonymiseGpx(gpx, DISGUISE);
    const [a] = parseGPX(out);
    expect(a!.activity.distanceKm).toBeGreaterThan(1.85);
    expect(a!.activity.distanceKm).toBeLessThan(1.95);
    expect(out).toContain('creator="Lapline test fixture"');
    expect(out).not.toContain('lat="40.0000000"');
    const lat = a!.records[0]!.lat!;
    expect(Math.abs(lat - DISGUISE.centre.lat)).toBeLessThan(0.01);
    expect(Math.min(...a!.records.map((r) => r.altitude))).toBeCloseTo(DISGUISE.lowestAltM, 1);
    // The file's own time is now the first kept point's.
    expect(/<metadata>\s*<time>([^<]+)/.exec(out)![1]).toBe(/<trkpt[\s\S]*?<time>([^<]+)/.exec(out)![1]);
  });

  it('drops points of a loop that pass back near the real start', () => {
    // Four laps of a ~1.26 km circle (radius 200 m) starting and finishing on it.
    const centre = { lat: 40, lon: -3 };
    const loop = Array.from({ length: 4 * 126 + 1 }, (_, i) => {
      const a = (i / 126) * 2 * Math.PI;
      const p = { lat: centre.lat + (200 * Math.sin(a)) / 111_195, lon: centre.lon + (200 * (1 - Math.cos(a))) / (111_195 * Math.cos((40 * Math.PI) / 180)) };
      return { ...p, xml: `   <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">\n    <ele>5.0</ele>\n    <time>${new Date(start + i * 3000).toISOString()}</time>\n   </trkpt>` };
    });
    const text = `<gpx creator="x" version="1.1">\n <trk>\n  <trkseg>\n${loop.map((p) => p.xml).join('\n')}\n  </trkseg>\n </trk>\n</gpx>\n`;
    const out = anonymiseGpx(text, DISGUISE);
    // The start point is 0 m from itself: everything within 300 m of it goes,
    // which on this circle (furthest point 400 m away) is most of each lap.
    const far = loop.filter((p) => metres(p, loop[0]!) >= 300).length;
    const kept = (out.match(/<trkpt/g) ?? []).length;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThanOrEqual(far);
  });

  it('shifts every time by whole days, keeping the time of day', () => {
    const [a] = parseGPX(gpx);
    const [b] = parseGPX(shiftGpxDays(gpx, -100));
    expect(b!.activity.date).toBe('2024-01-22');
    expect(shiftGpxDays(gpx, -100)).toContain('<time>2024-01-22T07:30:00Z</time>');
    expect(b!.activity.durationMin).toBe(a!.activity.durationMin);
  });
});
