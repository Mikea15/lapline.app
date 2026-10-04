import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { backupPathFor, buildManifest, parseManifest, createBackupZip, readBackupZip, backupFilename, MANIFEST_PATH } from '../backup';
import { MAX_IMPORT_FILE_BYTES } from '../import-failure';

const fitA = new Uint8Array([14, 16, 1, 2, 3, 4, 46, 70, 73, 84]);
const gpxB = strToU8('<gpx><trk></trk></gpx>');

describe('backupPathFor', () => {
  it('prefixes an index so duplicate filenames stay unique and ordered', () => {
    expect(backupPathFor(0, 'run.fit')).toBe('files/0001-run.fit');
    expect(backupPathFor(1, 'run.fit')).toBe('files/0002-run.fit');
  });

  it('strips path separators so a filename cannot escape files/', () => {
    expect(backupPathFor(0, '../../evil.fit')).toBe('files/0001-_.._evil.fit');
    expect(backupPathFor(0, 'a\\b.fit')).toBe('files/0001-a_b.fit');
  });
});

// Every network opt-in the app reads (stores.svelte.ts: `_settings.<x>_enabled`),
// found from the source so a new one can't be forgotten here.
const OPT_IN_KEYS = [
  ...new Set(Array.from(readFileSync(fileURLToPath(new URL('../stores.svelte.ts', import.meta.url)), 'utf8').matchAll(/_settings\.(\w+_enabled)\b/g), (m) => m[1]!))
];

describe('buildManifest', () => {
  it('drops browser-specific settings', () => {
    const m = buildManifest([], { unit_system: 'imperial', has_seen_welcome: 'true' }, '1.3.0', '2026-09-24T00:00:00Z');
    expect(m.settings).toEqual({ unit_system: 'imperial' });
  });

  it('drops every network opt-in', () => {
    expect(OPT_IN_KEYS.sort()).toEqual(['analytics_enabled', 'location_lookup_enabled', 'map_tiles_enabled', 'weather_lookup_enabled']);
    const settings = Object.fromEntries([...OPT_IN_KEYS.map((k) => [k, 'true']), ['unit_system', 'imperial']]);
    expect(buildManifest([], settings, '1.3.0', '').settings).toEqual({ unit_system: 'imperial' });
  });
});

describe('parseManifest', () => {
  it('rejects a zip from something else', () => {
    expect(() => parseManifest('{"format":"other"}')).toThrow("isn't a Lapline backup");
  });

  it('rejects a backup from a newer format version', () => {
    expect(() => parseManifest(JSON.stringify({ format: 'lapline-backup', formatVersion: 99, files: [] }))).toThrow('newer version');
  });

  it('rejects damaged JSON', () => {
    expect(() => parseManifest('{nope')).toThrow('damaged');
  });

  it('keeps only string settings', () => {
    const m = parseManifest(JSON.stringify({ format: 'lapline-backup', formatVersion: 1, files: [], settings: { max_hr: '190', bad: 5 } }));
    expect(m.settings).toEqual({ max_hr: '190' });
  });

  it('never restores a network opt-in, even from a backup that carries one', () => {
    const settings = Object.fromEntries([...OPT_IN_KEYS.map((k) => [k, 'true']), ['max_hr', '190']]);
    const m = parseManifest(JSON.stringify({ format: 'lapline-backup', formatVersion: 1, files: [], settings }));
    expect(m.settings).toEqual({ max_hr: '190' });
  });
});

describe('createBackupZip / readBackupZip', () => {
  it('round-trips files byte-for-byte, in order, with settings', async () => {
    const zipped = await createBackupZip(
      [
        { filename: 'run.fit', importedAt: '2026-09-01T10:00:00Z', data: fitA },
        { filename: 'run.fit', importedAt: '2026-09-02T10:00:00Z', data: gpxB }
      ],
      { unit_system: 'imperial', has_seen_welcome: 'true' },
      '1.3.0',
      '2026-09-24T12:00:00Z'
    );
    const restored = await readBackupZip(zipped);
    expect(restored.files.map((f) => f.filename)).toEqual(['run.fit', 'run.fit']);
    expect(Array.from(restored.files[0]!.data)).toEqual(Array.from(fitA));
    expect(Array.from(restored.files[1]!.data)).toEqual(Array.from(gpxB));
    expect(restored.manifest!.settings).toEqual({ unit_system: 'imperial' });
    expect(restored.manifest!.appVersion).toBe('1.3.0');
    expect(restored.missing).toEqual([]);
  });

  it('reports manifest entries whose file is missing from the zip', async () => {
    const manifest = buildManifest([{ filename: 'gone.fit', importedAt: '' }], {}, '1.3.0', '');
    const zipped = zipSync({ [MANIFEST_PATH]: strToU8(JSON.stringify(manifest)) });
    const restored = await readBackupZip(zipped);
    expect(restored.files).toEqual([]);
    expect(restored.missing).toEqual(['gone.fit']);
  });

  it('reads a zip of workout files with no manifest (e.g. a Garmin export)', async () => {
    const zipped = zipSync({ 'Activities/run.FIT': fitA, 'ride.gpx': gpxB, '__MACOSX/Activities/._run.FIT': fitA, 'notes.txt': strToU8('hi') });
    const restored = await readBackupZip(zipped);
    expect(restored.manifest).toBeNull();
    expect(restored.files.map((f) => f.filename).sort()).toEqual(['ride.gpx', 'run.FIT']);
  });

  it('rejects a zip with no manifest and no workouts', async () => {
    await expect(readBackupZip(zipSync({ 'other.txt': strToU8('hi') }))).rejects.toThrow('no workouts or Lapline backup');
  });

  it('rejects bytes that are not a zip', async () => {
    await expect(readBackupZip(strToU8('not a zip'))).rejects.toThrow("isn't a readable .zip");
  });
});

describe('readBackupZip size limits', () => {
  const tenBytes = () => new Uint8Array(10).fill(7);

  it('leaves a file over the per-file limit packed and says why', async () => {
    // 30 MB of zeros packs to a few KB: the shape of a zip bomb.
    const zipped = zipSync({ 'huge.fit': new Uint8Array(MAX_IMPORT_FILE_BYTES + 1), 'run.fit': fitA }, { level: 1 });
    const restored = await readBackupZip(zipped);
    expect(restored.files.map((f) => f.filename)).toEqual(['run.fit']);
    expect(restored.skipped).toEqual([{ filename: 'huge.fit', reason: 'too_large' }]);
  });

  it('stops unpacking once the zip’s total limit is reached', async () => {
    const zipped = zipSync({ 'a.fit': tenBytes(), 'b.fit': tenBytes(), 'c.fit': tenBytes() });
    const restored = await readBackupZip(zipped, { fileBytes: 100, totalBytes: 25 });
    expect(restored.files.map((f) => f.filename)).toEqual(['a.fit', 'b.fit']);
    expect(restored.skipped).toEqual([{ filename: 'c.fit', reason: 'zip_too_large' }]);
  });

  it('reports a backup file over the limit by its original name, not as missing', async () => {
    const manifest = buildManifest(
      [
        { filename: 'small.fit', importedAt: '' },
        { filename: 'big.fit', importedAt: '' }
      ],
      {},
      '1.3.0',
      ''
    );
    const zipped = zipSync({
      [MANIFEST_PATH]: strToU8(JSON.stringify(manifest)),
      [manifest.files[0]!.path]: tenBytes(),
      [manifest.files[1]!.path]: new Uint8Array(500)
    });
    const restored = await readBackupZip(zipped, { fileBytes: 400, totalBytes: 100_000 });
    expect(restored.files.map((f) => f.filename)).toEqual(['small.fit']);
    expect(restored.skipped).toEqual([{ filename: 'big.fit', reason: 'too_large' }]);
    expect(restored.missing).toEqual([]);
  });

  it('unpacks only the files a backup lists', async () => {
    const manifest = buildManifest([{ filename: 'run.fit', importedAt: '' }], {}, '1.3.0', '');
    const zipped = zipSync({
      [MANIFEST_PATH]: strToU8(JSON.stringify(manifest)),
      [manifest.files[0]!.path]: fitA,
      'files/extra.fit': fitA
    });
    const restored = await readBackupZip(zipped);
    expect(restored.files.map((f) => f.filename)).toEqual(['run.fit']);
  });

  it('treats a manifest over the limit as a damaged backup', async () => {
    const manifest = buildManifest([{ filename: 'run.fit', importedAt: '' }], {}, '1.3.0', '');
    const zipped = zipSync({ [MANIFEST_PATH]: strToU8(JSON.stringify(manifest)) });
    await expect(readBackupZip(zipped, { fileBytes: 20, totalBytes: 1000 })).rejects.toThrow('damaged');
  });

  it('never unpacks more than an entry claims, even when the claim is a lie', async () => {
    const zipped = zipSync({ 'bomb.fit': new Uint8Array(400_000) });
    // Patch the central directory's uncompressed size (offset 24) down to 1,000.
    const view = new DataView(zipped.buffer, zipped.byteOffset, zipped.byteLength);
    let cd = zipped.byteLength - 22;
    while (view.getUint32(cd, true) !== 0x02014b50) cd--;
    view.setUint32(cd + 24, 1000, true);
    const restored = await readBackupZip(zipped).catch((e: Error) => e);
    // Either refused as unreadable or cut at the claimed size - never 400 KB.
    if (restored instanceof Error) expect(restored.message).toMatch(/readable/);
    else expect(restored.files[0]!.data.byteLength).toBeLessThanOrEqual(1000);
  });
});

describe('backupFilename', () => {
  it('uses the local date', () => {
    expect(backupFilename(new Date(2026, 8, 24, 23, 30))).toBe('lapline-backup-2026-09-24.zip');
  });
});
