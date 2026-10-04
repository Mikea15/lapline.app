// lib/efforts-progress.svelte.ts
// Reactive progress of the background fill of db.activityEfforts
// (lib/efforts-store.ts) - the first boot after the v8 upgrade, or after
// EFFORTS_VERSION is bumped. Screens whose numbers come from best efforts
// read it to show "Working out your best efforts... 340 of 2,000" rather
// than wait for the fill.

export const effortsFill = $state({
  /** A fill is under way: rows the screens ask for that aren't stored yet are left for it, not computed on demand. */
  running: false,
  /** Activities handled so far, out of `total` (the ones that needed a row). */
  done: 0,
  total: 0,
  /** Bumped about every FILL_TICK_MS while filling, and once more at the end, so a screen can refresh what it shows without redoing it for every activity. */
  tick: 0
});

export const FILL_TICK_MS = 2000;
