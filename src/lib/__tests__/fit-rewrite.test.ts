import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { rewriteFit, shiftFitTimestamps, lastFitTimestamp, fitCrc } from '../fit-rewrite';
import { parseFIT } from '../fit-parser';

// The bundled sample files (public/demo), not the private stub-data, so this
// also runs from the public repo.
const DEMO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../public/demo');
const demoFiles = readdirSync(DEMO_DIR).filter((f) => f.endsWith('.fit'));
const load = (name: string) => new Uint8Array(readFileSync(path.join(DEMO_DIR, name)));

describe('rewriteFit', () => {
  it('round-trips every sample file byte for byte when nothing is changed', () => {
    expect(demoFiles.length).toBeGreaterThan(0);
    for (const f of demoFiles) {
      const bytes = load(f);
      expect(Array.from(rewriteFit(bytes))).toEqual(Array.from(bytes));
    }
  });

  it('writes a valid file CRC and data size after dropping messages', async () => {
    const bytes = load('sample-run-long.fit');
    const out = rewriteFit(bytes, { keep: (g) => g !== 21 }); // drop events
    const view = new DataView(out.buffer);
    const headerSize = out[0]!;
    expect(view.getUint32(4, true)).toBe(out.length - headerSize - 2);
    expect(view.getUint16(out.length - 2, true)).toBe(fitCrc(out, 0, out.length - 2));
    expect(out.length).toBeLessThan(bytes.length);
    // Still parses, to the same distance.
    const [a] = await parseFIT(bytes);
    const [b] = await parseFIT(out);
    expect(b!.activity.distanceKm).toBe(a!.activity.distanceKm);
  });

  it('rejects something that is not a FIT file', () => {
    expect(() => rewriteFit(new TextEncoder().encode('<gpx></gpx> not a fit file at all'))).toThrow();
  });
});

describe('shiftFitTimestamps', () => {
  it('moves the whole session by whole days without changing its content', async () => {
    const bytes = load('sample-run-steady.fit');
    const shifted = shiftFitTimestamps(bytes, 10 * 86400);
    expect(lastFitTimestamp(shifted)! - lastFitTimestamp(bytes)!).toBe(10 * 86400);
    const [a] = await parseFIT(bytes);
    const [b] = await parseFIT(shifted);
    const dayMs = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
    expect((dayMs(b!.activity.date) - dayMs(a!.activity.date)) / 86400000).toBe(10);
    expect(b!.activity.distanceKm).toBe(a!.activity.distanceKm);
    expect(b!.activity.durationMin).toBe(a!.activity.durationMin);
    expect(b!.laps.length).toBe(a!.laps.length);
  });

  it('rounds the shift to 32s so compressed timestamps stay consistent', () => {
    const bytes = load('sample-ride.fit');
    const shifted = shiftFitTimestamps(bytes, 1000);
    expect(lastFitTimestamp(shifted)! - lastFitTimestamp(bytes)!).toBe(992);
  });
});

describe('bundled sample data', () => {
  it('has no device serial numbers and no user profile', () => {
    for (const f of demoFiles) {
      const seen = new Set<number>();
      rewriteFit(load(f), {
        edit(m) {
          seen.add(m.global);
          if (m.global === 0) expect(m.get(3)).toBeNull();
        }
      });
      expect(seen.has(23)).toBe(false); // device_info
      expect(seen.has(3)).toBe(false); // user_profile
    }
  });

  it('covers running, cycling, a pool swim and a session without GPS', async () => {
    const parsed = await Promise.all(demoFiles.map(async (f) => (await parseFIT(load(f)))[0]!));
    const sports = parsed.map((p) => p.activity.sport.toLowerCase());
    expect(sports.some((s) => s.includes('run'))).toBe(true);
    expect(sports.some((s) => s.includes('cycl'))).toBe(true);
    expect(parsed.some((p) => p.lengths.length > 0)).toBe(true);
    expect(parsed.some((p) => !p.records.some((r) => r.lat != null))).toBe(true);
  });
});
