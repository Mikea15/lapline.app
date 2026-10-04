// scripts/demo/make-test-fixtures.ts - builds test-fixtures/, the real-world
// .fit and .gpx files the unit tests and perf benchmarks run against, from
// the private stub-data/ recordings (see anonymise.ts for what's changed,
// and for the secret seed this needs). Sports, laps, lengths, heart rate and
// device metrics are the originals'; GPS routes are trimmed and moved,
// altitudes offset, and each file is moved by its own random whole number of
// days (time of day kept). Run with `npm run test-fixtures`; the output is
// committed.
import fs from 'fs';
import path from 'path';
import { shiftFitTimestamps } from '../../src/lib/fit-rewrite';
import { anonymiseFit, anonymiseGpx, firstFitPosition, firstGpxTime, loadSeed, makeDisguise, randInt, secretRandom, shiftGpxDays } from './anonymise';

const SRC = 'stub-data';
const OUT = 'test-fixtures';

// Published names for stub-data's .fit files, in the order of their (private,
// date-based) names - which must not appear in anything published, this
// script included.
const FIT_NAMES = [
  'cardio-1.fit',
  'run-easy.fit',
  'pool-swim-1.fit',
  'ride-morning.fit',
  'ride-evening.fit',
  'run-long.fit',
  'cardio-2.fit',
  'pool-swim-2.fit',
  'bouldering.fit',
  'run-steady.fit',
  'cardio-3.fit',
  'footy.fit'
];
// GPX tracks to include (all 20 would add ~5 MB for little extra coverage),
// by position among stub-data's .gpx files sorted by their first <time>
// (the private names are activity IDs, the times real dates).
const GPX_PICKS: Record<number, string> = { 0: 'gpx-run-1.gpx', 1: 'gpx-run-2.gpx', 5: 'gpx-run-3.gpx', 13: 'gpx-run-4.gpx', 16: 'gpx-run-5.gpx', 19: 'gpx-run-6.gpx' };
const GPX_COUNT = 20;

const seed = loadSeed();
const fitSrc = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith('.fit'))
  .sort();
if (fitSrc.length !== FIT_NAMES.length) throw new Error(`stub-data/ has ${fitSrc.length} .fit files, FIT_NAMES names ${FIT_NAMES.length} - update it`);
const fits = fitSrc.map((src, i) => ({ src, name: FIT_NAMES[i]!, bytes: new Uint8Array(fs.readFileSync(path.join(SRC, src))) }));

const gpxAll = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith('.gpx'))
  .map((src) => ({ src, text: fs.readFileSync(path.join(SRC, src), 'utf8') }))
  .sort((a, b) => (firstGpxTime(a.text) ?? '').localeCompare(firstGpxTime(b.text) ?? ''));
if (gpxAll.length !== GPX_COUNT) throw new Error(`stub-data/ has ${gpxAll.length} .gpx files, expected ${GPX_COUNT} - update GPX_PICKS`);

// Any real position, to find stray position fields in files without GPS.
const region = fits.map((f) => firstFitPosition(f.bytes)).find((p) => p !== null) ?? null;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of fits) {
  // Keyed by the source, so a recording that's also a demo sample gets the same route there.
  const { bytes, cleared } = anonymiseFit(f.bytes, makeDisguise(secretRandom(seed, `route:${f.src}`)), region);
  const days = randInt(secretRandom(seed, `days:fixture:${f.src}`), -400, -30);
  const out = shiftFitTimestamps(bytes, days * 86400);
  fs.writeFileSync(path.join(OUT, f.name), out);
  console.log(`${f.name}  ${(out.length / 1024).toFixed(0)} KB  (${cleared} stray position fields cleared)`);
}
for (const [index, name] of Object.entries(GPX_PICKS)) {
  const g = gpxAll[Number(index)]!;
  const dayRand = secretRandom(seed, `days:fixture:${g.src}`);
  const days = randInt(dayRand, 30, 400) * (dayRand() < 0.5 ? -1 : 1);
  const text = shiftGpxDays(anonymiseGpx(g.text, makeDisguise(secretRandom(seed, `route:${g.src}`))), days);
  fs.writeFileSync(path.join(OUT, name), text);
  console.log(`${name}  ${(text.length / 1024).toFixed(0)} KB`);
}
