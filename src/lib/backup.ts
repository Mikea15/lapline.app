// lib/backup.ts
// Export / restore of everything needed to rebuild this browser's data
// elsewhere (another browser, device, or domain - browser storage is
// per-origin, so moving the app to a new domain starts every user empty).
//
// The archive is a plain .zip anyone can open:
//   lapline-backup.json  - manifest: format/version, app version, settings,
//                          and each stored file's original name + import time
//   files/0001-<name>    - the raw .fit/.gpx bytes exactly as imported
//
// Raw files rather than parsed rows on purpose: restoring runs them back
// through the normal import pipeline, so the restored data is parsed by the
// *current* parser (the same idea as Settings > "Re-parse stored files"),
// and the format never has to track the IndexedDB schema.
import { zip, unzip, strToU8, strFromU8, type Zippable, type UnzipFileFilter } from 'fflate';
import { MAX_IMPORT_FILE_BYTES, MAX_ZIP_BYTES, MAX_ZIP_CONTENT_BYTES, type ImportFailureReason } from './import-failure';

const DAMAGED_BACKUP = "This backup is damaged and can't be restored. Make a new backup in the browser you came from.";

export const BACKUP_FORMAT = 'lapline-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MANIFEST_PATH = 'lapline-backup.json';

export interface BackupFileEntry {
  path: string; // path inside the zip
  filename: string; // original import filename
  importedAt: string;
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  settings: Record<string, string>;
  files: BackupFileEntry[];
}

export interface BackupSourceFile {
  filename: string;
  importedAt: string;
  data: Uint8Array;
}

// Never carried to another browser: settings that describe this browser
// rather than the user's preferences, and the opt-ins that send data to
// outside services (the get*Enabled getters in stores.svelte.ts). Consent
// belongs to the browser that will make the requests, so after a restore
// each stays off until the user turns it on there.
const NON_PORTABLE_SETTINGS = new Set<string>([
  'has_seen_welcome',
  'analytics_enabled',
  'location_lookup_enabled',
  'map_tiles_enabled',
  'weather_lookup_enabled'
]);

// "files/0007-Morning Run.fit" - the index prefix keeps paths unique when two
// imports share a filename, and keeps the zip in original import order. Path
// separators are stripped so a filename can never escape files/.
export function backupPathFor(index: number, filename: string): string {
  const safe = filename.replace(/[\\/]/g, '_').replace(/^\.+/, '') || 'activity';
  return `files/${String(index + 1).padStart(4, '0')}-${safe}`;
}

export function buildManifest(
  files: Omit<BackupSourceFile, 'data'>[],
  settings: Record<string, string>,
  appVersion: string,
  exportedAt: string
): BackupManifest {
  const portable = Object.fromEntries(Object.entries(settings).filter(([k]) => !NON_PORTABLE_SETTINGS.has(k)));
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    exportedAt,
    settings: portable,
    files: files.map((f, i) => ({ path: backupPathFor(i, f.filename), filename: f.filename, importedAt: f.importedAt }))
  };
}

// Validates an untrusted manifest (it comes from a user-picked file) and
// returns it typed, or throws an error message fit to show the user.
export function parseManifest(json: string): BackupManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error(DAMAGED_BACKUP);
  }
  const m = raw as Partial<BackupManifest> | null;
  if (!m || m.format !== BACKUP_FORMAT) throw new Error("This .zip isn't a Lapline backup.");
  if (typeof m.formatVersion !== 'number' || m.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error('This backup was made by a newer version of Lapline. Reload the app to update, then try again.');
  }
  if (!Array.isArray(m.files) || !m.files.every((f) => f && typeof f.path === 'string' && typeof f.filename === 'string')) {
    throw new Error(DAMAGED_BACKUP);
  }
  const settings: Record<string, string> = {};
  if (m.settings && typeof m.settings === 'object') {
    for (const [k, v] of Object.entries(m.settings)) {
      if (typeof v === 'string' && !NON_PORTABLE_SETTINGS.has(k)) settings[k] = v;
    }
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: m.formatVersion,
    appVersion: typeof m.appVersion === 'string' ? m.appVersion : '',
    exportedAt: typeof m.exportedAt === 'string' ? m.exportedAt : '',
    settings,
    files: m.files.map((f) => ({ path: f.path, filename: f.filename, importedAt: typeof f.importedAt === 'string' ? f.importedAt : '' }))
  };
}

export function createBackupZip(files: BackupSourceFile[], settings: Record<string, string>, appVersion: string, exportedAt: string): Promise<Uint8Array> {
  const manifest = buildManifest(files, settings, appVersion, exportedAt);
  const entries: Zippable = { [MANIFEST_PATH]: strToU8(JSON.stringify(manifest, null, 2)) };
  manifest.files.forEach((f, i) => {
    entries[f.path] = files[i]!.data;
  });
  return new Promise((resolve, reject) => {
    // fflate's async zip compresses off the main thread, so a large history
    // doesn't freeze the page while it's packed.
    zip(entries, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

export interface RestoredBackup {
  /** null for a zip of workout files with no manifest (e.g. Garmin's
      "Export Original"): `files` is then every .fit/.gpx found in it. */
  manifest: BackupManifest | null;
  files: { filename: string; data: Uint8Array }[];
  missing: string[]; // manifest entries whose bytes weren't in the zip
  /** Files left packed because of the size limits, with the reason. */
  skipped: { filename: string; reason: ImportFailureReason }[];
}

export interface ZipLimits {
  /** Per unpacked file. */
  fileBytes: number;
  /** All unpacked files together. */
  totalBytes: number;
}

const ZIP_LIMITS: ZipLimits = { fileBytes: MAX_IMPORT_FILE_BYTES, totalBytes: MAX_ZIP_CONTENT_BYTES };

/** Shown instead of opening a .zip over MAX_ZIP_BYTES (read whole into memory). */
export const ZIP_TOO_LARGE_MESSAGE = `This .zip is over ${MAX_ZIP_BYTES / (1024 * 1024)} MB, too large to open here. Unzip it and import the .fit and .gpx files in smaller batches.`;

// Unpacks only the entries `wanted` accepts, within the size limits; the
// rest stay compressed and cost nothing. The sizes come from the zip's own
// headers, which a hostile zip can lie about, but fflate never inflates an
// entry past its stated `originalSize`, and a stored entry is `size` bytes,
// so the larger of the two bounds what each entry can take in memory.
function unzipSome(
  bytes: Uint8Array,
  wanted: (path: string) => boolean,
  limits: ZipLimits,
  skipped: Map<string, ImportFailureReason>
): Promise<Record<string, Uint8Array>> {
  let total = 0;
  const filter: UnzipFileFilter = (f) => {
    if (!wanted(f.name)) return false;
    const size = Math.max(f.size, f.originalSize);
    if (size > limits.fileBytes) {
      skipped.set(f.name, 'too_large');
      return false;
    }
    if (total + size > limits.totalBytes) {
      skipped.set(f.name, 'zip_too_large');
      return false;
    }
    total += size;
    return true;
  };
  return new Promise((resolve, reject) => {
    unzip(bytes, { filter }, (err, out) => (err ? reject(new Error("This file isn't a readable .zip.")) : resolve(out)));
  });
}

function baseName(path: string): string {
  return path.split('/').pop() ?? '';
}

// A .fit/.gpx anywhere in the zip, but not macOS metadata (__MACOSX/, ._ files).
function isWorkoutPath(path: string): boolean {
  const name = baseName(path);
  return !path.startsWith('__MACOSX/') && !name.startsWith('.') && /\.(fit|gpx)$/i.test(name);
}

/**
 * Reads a Lapline backup, or any zip of .fit/.gpx files. Two passes over the
 * zip's directory: the first unpacks only the manifest, the second only the
 * files it lists (or, with no manifest, the workout files), so nothing else
 * in a big export - inner zips, photos, health data - is ever unpacked.
 */
export async function readBackupZip(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): Promise<RestoredBackup> {
  const tooLarge = new Map<string, ImportFailureReason>();
  const head = await unzipSome(bytes, (path) => path === MANIFEST_PATH, limits, tooLarge);
  if (tooLarge.has(MANIFEST_PATH)) throw new Error(DAMAGED_BACKUP);
  const manifestBytes = head[MANIFEST_PATH];
  const manifest = manifestBytes ? parseManifest(strFromU8(manifestBytes)) : null;

  const listed = manifest ? new Set(manifest.files.map((f) => f.path)) : null;
  const entries = await unzipSome(bytes, (path) => (listed ? listed.has(path) : isWorkoutPath(path)), limits, tooLarge);

  if (!manifest) {
    // Each under its own name, folders dropped.
    const files = Object.entries(entries).map(([path, data]) => ({ filename: baseName(path), data }));
    const skipped = [...tooLarge].map(([path, reason]) => ({ filename: baseName(path), reason }));
    if (files.length === 0 && skipped.length === 0) throw new Error('This .zip has no workouts or Lapline backup in it.');
    return { manifest: null, files, missing: [], skipped };
  }
  const files: RestoredBackup['files'] = [];
  const missing: string[] = [];
  const skipped: RestoredBackup['skipped'] = [];
  for (const f of manifest.files) {
    const data = entries[f.path];
    const reason = tooLarge.get(f.path);
    if (data) files.push({ filename: f.filename, data });
    else if (reason) skipped.push({ filename: f.filename, reason });
    else missing.push(f.filename);
  }
  return { manifest, files, missing, skipped };
}

export function backupFilename(now: Date): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `lapline-backup-${d}.zip`;
}
