// lib/db-status.svelte.ts
// What happens when another tab changes the database under this one.
//
// A new deploy can bump the Dexie schema version (lib/db.ts). The tab that
// loads the new code asks every other open tab to close its connection
// (IndexedDB's `versionchange`); until they do, its upgrade is `blocked`.
// Dexie's default is to close and silently reopen on the next query, which
// leaves an old tab running old code against a newer schema. Instead this
// tab closes for good and App.svelte shows a "reload" banner.

import type Dexie from 'dexie';

let _closedByOtherTab = $state(false);

export const dbStatus = {
  /** True once another tab upgraded (or deleted) the database and this tab
   *  closed its connection. Every later read or write fails until reload. */
  get closedByOtherTab() {
    return _closedByOtherTab;
  }
};

/** Call once, before the first query. `onBlocked` runs when this tab's own
 *  upgrade has to wait for another tab (e.g. a frozen background tab) to
 *  close. */
export function watchDbVersion(db: Dexie, onBlocked: () => void): void {
  db.on('versionchange', () => {
    db.close();
    _closedByOtherTab = true;
    return false; // skip Dexie's default close-and-reopen
  });
  db.on('blocked', onBlocked);
}
