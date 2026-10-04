import 'fake-indexeddb/auto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { fitFilesStore, importStore } from '../stores.svelte';
import { failureMessage } from '../import-failure';

// The real parse path, with the workers running in-process.
vi.mock('../fit-parse-pool', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../fit-parse-pool')>();
  const { createInProcessWorker } = await import('./in-process-worker');
  return { ...actual, createFitParsePool: (n: number) => actual.createFitParsePool(n, { createWorker: createInProcessWorker }) };
});

const FIXTURES = fileURLToPath(new URL('../../../test-fixtures/', import.meta.url));
const fixtureFile = (name: string) => new File([readFileSync(FIXTURES + name)], name);
// A short GPX run (the fixture GPX files are slow under fake-indexeddb).
function gpxFile(name: string): File {
  const pts = Array.from({ length: 60 }, (_, i) => `<trkpt lat="${(52.3 + i * 0.00003).toFixed(6)}" lon="4.9"><time>${new Date(Date.UTC(2026, 0, 5, 8, 0, i)).toISOString()}</time></trkpt>`);
  return new File([`<?xml version="1.0"?><gpx><trk><trkseg>${pts.join('')}</trkseg></trk></gpx>`], name);
}
const FIT_A = 'run-easy.fit';
const FIT_B = 'ride-morning.fit';

beforeEach(async () => {
  await db.delete({ disableAutoOpen: false });
  importStore.reset();
});

describe('fitFilesStore.reparseAll', () => {
  it('re-reads every stored .fit and .gpx file in place', async () => {
    await importStore.importFiles([fixtureFile(FIT_A), fixtureFile(FIT_B), gpxFile('run.gpx')]);
    expect(importStore.state.result?.errors).toEqual([]);
    const before = await db.activities.orderBy('id').toArray();
    expect(before).toHaveLength(3);

    const result = await fitFilesStore.reparseAll();

    expect(result).toEqual({ filesReparsed: 3, activitiesUpdated: 3, errors: [] });
    const after = await db.activities.orderBy('id').toArray();
    expect(after.map((a) => [a.id, a.sourceFileId, a.date, a.sport])).toEqual(before.map((a) => [a.id, a.sourceFileId, a.date, a.sport]));
    expect(fitFilesStore.reparsing).toBe(false);
  });

  it('reports a file whose stored copy is gone or unreadable, in file order, and carries on', async () => {
    // Imported in this order, so stored (and reported) in it too.
    for (const f of [fixtureFile(FIT_A), fixtureFile(FIT_B), gpxFile('run.gpx')]) await importStore.importFiles([f]);
    const idOf = async (name: string) => (await db.fitFiles.where('filename').equals(name).first())!.id;
    await db.fitFileBlobs.delete(await idOf(FIT_A));
    await db.fitFileBlobs.put({ id: await idOf(FIT_B), data: new TextEncoder().encode('not a fit file at all') });

    const result = await fitFilesStore.reparseAll();

    expect(result.filesReparsed).toBe(3);
    expect(result.activitiesUpdated).toBe(1); // the GPX run
    expect(result.errors).toEqual([
      `${FIT_A}: The stored copy of this file is missing. Import it again.`,
      `${FIT_B}: ${failureMessage('not_fit')}`
    ]);
  });
});

// Parsing lives in the worker: a main-thread import of either parser would
// make the build emit fit-file-parser a second time.
describe('main-thread code', () => {
  const SRC = fileURLToPath(new URL('../../', import.meta.url));
  const WORKER_SIDE = new Set(['lib/fit-parser.worker.ts', 'lib/parse-workout.ts', 'lib/fit-parser.ts', 'lib/gpx-parser.ts']);
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sources(full);
      return /\.(ts|svelte)$/.test(name) ? [full] : [];
    });
  }

  it('never imports the parsers', () => {
    const offenders = sources(SRC)
      .filter((f) => !WORKER_SIDE.has(path.relative(SRC, f).replace(/\\/g, '/')))
      .filter((f) => /from ['"][^'"]*(fit-parser|gpx-parser|parse-workout)['"]|import\(['"][^'"]*(fit-parser|gpx-parser|parse-workout)['"]\)/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
