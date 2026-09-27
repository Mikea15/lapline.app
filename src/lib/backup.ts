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
import { zip, unzip, strToU8, strFromU8, type Zippable } from 'fflate';

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

// Settings that describe this browser rather than the user's preferences -
// never carried to another browser.
const NON_PORTABLE_SETTINGS = new Set<string>(['has_seen_welcome']);

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
    throw new Error("This backup's manifest is damaged (not valid JSON).");
  }
  const m = raw as Partial<BackupManifest> | null;
  if (!m || m.format !== BACKUP_FORMAT) throw new Error("This zip isn't a Lapline backup.");
  if (typeof m.formatVersion !== 'number' || m.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error('This backup was made by a newer version of Lapline. Reload the app to update, then try again.');
  }
  if (!Array.isArray(m.files) || !m.files.every((f) => f && typeof f.path === 'string' && typeof f.filename === 'string')) {
    throw new Error("This backup's file list is damaged.");
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
  manifest: BackupManifest;
  files: { filename: string; data: Uint8Array }[];
  missing: string[]; // manifest entries whose bytes weren't in the zip
}

export async function readBackupZip(bytes: Uint8Array): Promise<RestoredBackup> {
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(bytes, (err, out) => (err ? reject(new Error("This file isn't a readable zip.")) : resolve(out)));
  });
  const manifestBytes = entries[MANIFEST_PATH];
  if (!manifestBytes) throw new Error("This zip isn't a Lapline backup (it has no lapline-backup.json).");
  const manifest = parseManifest(strFromU8(manifestBytes));
  const files: RestoredBackup['files'] = [];
  const missing: string[] = [];
  for (const f of manifest.files) {
    const data = entries[f.path];
    if (data) files.push({ filename: f.filename, data });
    else missing.push(f.filename);
  }
  return { manifest, files, missing };
}

export function backupFilename(now: Date): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `lapline-backup-${d}.zip`;
}
