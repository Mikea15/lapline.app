import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { backupPathFor, buildManifest, parseManifest, createBackupZip, readBackupZip, backupFilename, MANIFEST_PATH } from '../backup';

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

describe('buildManifest', () => {
  it('drops browser-specific settings', () => {
    const m = buildManifest([], { unit_system: 'imperial', has_seen_welcome: 'true' }, '1.3.0', '2026-09-24T00:00:00Z');
    expect(m.settings).toEqual({ unit_system: 'imperial' });
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
    expect(restored.manifest.settings).toEqual({ unit_system: 'imperial' });
    expect(restored.manifest.appVersion).toBe('1.3.0');
    expect(restored.missing).toEqual([]);
  });

  it('reports manifest entries whose file is missing from the zip', async () => {
    const manifest = buildManifest([{ filename: 'gone.fit', importedAt: '' }], {}, '1.3.0', '');
    const zipped = zipSync({ [MANIFEST_PATH]: strToU8(JSON.stringify(manifest)) });
    const restored = await readBackupZip(zipped);
    expect(restored.files).toEqual([]);
    expect(restored.missing).toEqual(['gone.fit']);
  });

  it('rejects a zip with no manifest', async () => {
    await expect(readBackupZip(zipSync({ 'other.txt': strToU8('hi') }))).rejects.toThrow('no lapline-backup.json');
  });

  it('rejects bytes that are not a zip', async () => {
    await expect(readBackupZip(strToU8('not a zip'))).rejects.toThrow("isn't a readable zip");
  });
});

describe('backupFilename', () => {
  it('uses the local date', () => {
    expect(backupFilename(new Date(2026, 8, 24, 23, 30))).toBe('lapline-backup-2026-09-24.zip');
  });
});
