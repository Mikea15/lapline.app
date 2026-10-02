// lib/release-notes.ts
// Manually-maintained changelog shown on the Release Notes panel (see
// ReleaseNotesPanel.svelte, opened from About). Newest release first.
// CURRENT_VERSION drives package.json's own version field too - bump both
// together when cutting a release.
export interface ReleaseNote {
  version: string;
  date: string; // YYYY-MM-DD
  changes: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.0.0',
    date: '2026-10-01',
    changes: ['Initial release: Lapline open to the world.']
  }
];

export const CURRENT_VERSION = RELEASE_NOTES[0]!.version;
