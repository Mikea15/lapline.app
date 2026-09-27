// scripts/demo/make-demo-data.ts - builds the bundled sample activities in
// public/demo/ from a few real recordings in stub-data/ (which is private and
// never published). Run with `npm run demo-data`; the output is committed, so
// this only needs re-running to change which sessions are included.
// Anonymising is anonymise.ts; on top of that, timestamps are shifted so the
// newest session ends on DEMO_END. The app shifts them again when you load
// the samples (lib/sample-data.ts), so they're always recent.
import fs from 'fs';
import path from 'path';
import { shiftFitTimestamps, lastFitTimestamp, FIT_EPOCH_OFFSET } from '../../src/lib/fit-rewrite';
import { anonymiseFit, firstFitPosition } from './anonymise';

const SRC = 'stub-data';
const OUT = 'public/demo';

// Which real sessions to use, and the published name for each. Covers
// running, cycling, a pool swim with lengths and a session with no GPS.
const PICKS: { src: string; name: string }[] = [
  { src: '2026-08-30-09-22-05.fit', name: 'sample-cardio.fit' },
  { src: '2026-08-31-18-37-54.fit', name: 'sample-run-easy.fit' },
  { src: '2026-09-02-19-15-49.fit', name: 'sample-pool-swim.fit' },
  { src: '2026-09-04-08-25-04.fit', name: 'sample-ride.fit' },
  { src: '2026-09-05-08-03-15.fit', name: 'sample-run-long.fit' },
  { src: '2026-09-12-08-56-36.fit', name: 'sample-run-steady.fit' }
];

const DEMO_END = Date.UTC(2026, 0, 10, 12, 0, 0) / 1000; // newest session ends here (Unix s)

const sources = PICKS.map((p) => ({ ...p, bytes: new Uint8Array(fs.readFileSync(path.join(SRC, p.src))) }));
// One origin for every file (the first GPS start), so they share a transform.
const origin = sources.map((s) => firstFitPosition(s.bytes)).find((p) => p !== null);
if (!origin) throw new Error('No GPS in any picked file');

const anonymised = sources.map((s) => ({ ...s, ...anonymiseFit(s.bytes, origin) }));

// Shift every file by the same amount, so their spacing is preserved.
const newest = Math.max(...anonymised.map((a) => lastFitTimestamp(a.bytes) ?? 0));
const delta = DEMO_END - FIT_EPOCH_OFFSET - newest;

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.fit')) fs.unlinkSync(path.join(OUT, f));
for (const a of anonymised) {
  const out = shiftFitTimestamps(a.bytes, delta);
  fs.writeFileSync(path.join(OUT, a.name), out);
  console.log(`${a.name}  ${(out.length / 1024).toFixed(0)} KB  (from ${a.src}, ${a.cleared} stray position fields cleared)`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ files: anonymised.map((a) => a.name) }, null, 2) + '\n');
