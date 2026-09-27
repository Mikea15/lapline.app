// scripts/demo/make-test-fixtures.ts - builds test-fixtures/, the real-world
// .fit and .gpx files the unit tests and perf benchmarks run against, from
// the private stub-data/ recordings (see anonymise.ts for what's changed).
// Names, dates and every parsed metric stay the same as the originals, so
// the tests' expectations hold; only GPS positions and identifying fields
// differ. Run with `npm run test-fixtures`; the output is committed.
import fs from 'fs';
import path from 'path';
import { anonymiseFit, anonymiseGpx, firstFitPosition, firstGpxPosition } from './anonymise';

const SRC = 'stub-data';
const OUT = 'test-fixtures';
// GPX tracks to include (all 20 would add ~5 MB for little extra coverage).
const GPX_PICKS = ['3920815460.gpx', '3942000557.gpx', '4088794170.gpx', '4168557098.gpx', '4250990517.gpx', '4318601815.gpx'];

const fitNames = fs.readdirSync(SRC).filter((f) => f.endsWith('.fit'));
const fits = fitNames.map((name) => ({ name, bytes: new Uint8Array(fs.readFileSync(path.join(SRC, name))) }));
const gpxs = GPX_PICKS.map((name) => ({ name, text: fs.readFileSync(path.join(SRC, name), 'utf8') }));

// One origin per format, so each set shares a transform.
const fitOrigin = fits.map((f) => firstFitPosition(f.bytes)).find((p) => p !== null);
const gpxOrigin = gpxs.map((g) => firstGpxPosition(g.text)).find((p) => p !== null);
if (!fitOrigin || !gpxOrigin) throw new Error('No GPS found to anchor the transform');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of fits) {
  const { bytes, cleared } = anonymiseFit(f.bytes, fitOrigin);
  fs.writeFileSync(path.join(OUT, f.name), bytes);
  console.log(`${f.name}  ${(bytes.length / 1024).toFixed(0)} KB  (${cleared} stray position fields cleared)`);
}
for (const g of gpxs) {
  const text = anonymiseGpx(g.text, gpxOrigin);
  fs.writeFileSync(path.join(OUT, g.name), text);
  console.log(`${g.name}  ${(text.length / 1024).toFixed(0)} KB`);
}
