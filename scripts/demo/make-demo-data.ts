// scripts/demo/make-demo-data.ts - builds the bundled sample activities in
// public/demo/ from a few real recordings in stub-data/ (which is private and
// never published). Run with `npm run demo-data`; the output is committed, so
// this only needs re-running to change which sessions are included.
// Anonymising is anonymise.ts (which also needs the secret seed); on top of
// that, each session moves to its own random day in the two weeks up to
// DEMO_END, keeping its time of day. The app shifts them again when you load
// the samples (lib/sample-data.ts), so they're always recent.
import fs from 'fs';
import path from 'path';
import { shiftFitTimestamps, lastFitTimestamp, FIT_EPOCH_OFFSET } from '../../src/lib/fit-rewrite';
import { anonymiseFit, firstFitPosition, loadSeed, makeDisguise, secretRandom } from './anonymise';

const SRC = 'stub-data';
const OUT = 'public/demo';

// Which real sessions to use, by position in stub-data's sorted .fit list
// (the private file names are real dates, so they don't appear here), and
// the published name for each. Covers running, cycling, a pool swim with
// lengths and a session with no GPS.
const STUB_FIT_COUNT = 12;
const PICKS: { index: number; name: string }[] = [
  { index: 0, name: 'sample-cardio.fit' },
  { index: 1, name: 'sample-run-easy.fit' },
  { index: 2, name: 'sample-pool-swim.fit' },
  { index: 3, name: 'sample-ride.fit' },
  { index: 5, name: 'sample-run-long.fit' },
  { index: 9, name: 'sample-run-steady.fit' }
];

const DEMO_END = Date.UTC(2026, 0, 10, 12, 0, 0) / 1000; // last day sessions land on (Unix s)
const DEMO_DAYS = 14; // ...and how many days back from it they spread over

const seed = loadSeed();
const stub = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith('.fit'))
  .sort();
if (stub.length !== STUB_FIT_COUNT) throw new Error(`stub-data/ has ${stub.length} .fit files, not ${STUB_FIT_COUNT} - re-check PICKS`);
const sources = PICKS.map((p) => ({ ...p, src: stub[p.index]!, bytes: new Uint8Array(fs.readFileSync(path.join(SRC, stub[p.index]!))) }));
const region = sources.map((s) => firstFitPosition(s.bytes)).find((p) => p !== null) ?? null;

// A distinct random day for each session (Fisher-Yates over the window).
const pickRand = secretRandom(seed, 'days:demo');
const dayOffsets = Array.from({ length: DEMO_DAYS }, (_, i) => i);
for (let i = dayOffsets.length - 1; i > 0; i--) {
  const j = Math.floor(pickRand() * (i + 1));
  [dayOffsets[i], dayOffsets[j]] = [dayOffsets[j]!, dayOffsets[i]!];
}
const lastDay = Math.floor(DEMO_END / 86400);
const dayOf = (fitSec: number) => Math.floor((fitSec + FIT_EPOCH_OFFSET) / 86400);

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.fit')) fs.unlinkSync(path.join(OUT, f));
for (const [i, s] of sources.entries()) {
  // Keyed by the source, so the route matches its test-fixtures copy.
  const { bytes, cleared } = anonymiseFit(s.bytes, makeDisguise(secretRandom(seed, `route:${s.src}`)), region);
  const last = lastFitTimestamp(bytes);
  if (last === null) throw new Error(`${s.src} has no timestamps`);
  const out = shiftFitTimestamps(bytes, (lastDay - dayOffsets[i]! - dayOf(last)) * 86400);
  fs.writeFileSync(path.join(OUT, s.name), out);
  console.log(`${s.name}  ${(out.length / 1024).toFixed(0)} KB  (${cleared} stray position fields cleared)`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ files: sources.map((s) => s.name) }, null, 2) + '\n');
