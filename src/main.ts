// main.ts - Application entry point
// Initializes stores, mounts root component.

import './styles/global.css';
import { mount, unmount } from 'svelte';
import App from './App.svelte';
import DbErrorScreen from './components/DbErrorScreen.svelte';
import { db } from './lib/db';
import { watchDbVersion } from './lib/db-status.svelte';
import { activitiesStore, initStores } from './lib/stores.svelte';
import { requestPersistentStorage } from './lib/storage-persist';

async function bootstrap() {
  // Fire-and-forget - never delays startup, and the result only matters to
  // the browser's eviction policy, not to anything the app renders.
  requestPersistentStorage().then((result) => console.log(`Persistent storage: ${result}`));

  // A schema upgrade waiting on another tab holds initStores() open until
  // that tab lets go - say so rather than leave a blank page meanwhile.
  let blockedScreen: ReturnType<typeof mount> | null = null;
  watchDbVersion(db, () => {
    blockedScreen ??= mount(DbErrorScreen, { target: document.body, props: { kind: 'blocked' } });
  });

  try {
    await initStores();
    console.log('Lapline initialized');
  } catch (e) {
    // Private mode, a full disk or a newer schema from another tab. Mounting
    // the app anyway would show an empty history, inviting a re-import or a
    // reset over data that is still there.
    console.error('Failed to initialize stores:', e);
    if (blockedScreen) unmount(blockedScreen);
    mount(DbErrorScreen, { target: document.body, props: { kind: 'failed', errorName: rootErrorName(e) } });
    // Still registered: if a stale cached app shell is the cause, the
    // worker's update check is what lets Reload fetch the new one.
    registerServiceWorker();
    return;
  }

  if (blockedScreen) unmount(blockedScreen);

  // Fills in the efforts summaries older activities don't have yet (the
  // first boot after the v8 upgrade); nothing to do once they're all there.
  // Planned before the app mounts (a read of one small table), so the
  // screens know from their first frame whether to wait for it; the fill
  // itself runs in the background after, with its progress in effortsFill.
  let runFill: (() => Promise<number>) | null = null;
  try {
    runFill = await activitiesStore.startEffortsBackfill();
  } catch (e) {
    console.error('Best-effort backfill failed:', e);
  }

  mount(App, { target: document.body });
  registerServiceWorker();
  runFill?.().then(
    (n) => n > 0 && console.log(`Computed best efforts for ${n} activities`),
    (e) => console.error('Best-effort backfill failed:', e)
  );
}

// Dexie wraps the browser's error (DatabaseClosedError around a
// QuotaExceededError, say); the innermost name is the useful one.
function rootErrorName(e: unknown): string {
  let err = e;
  while (err instanceof Error && 'inner' in err && err.inner instanceof Error) err = err.inner;
  return err instanceof Error ? err.name : '';
}

// Production only - under `vite dev` a cached app shell would fight HMR.
// See scripts/pwa/vite-sw-plugin.ts for what the worker caches.
function registerServiceWorker() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}app/sw.js`, { scope: `${import.meta.env.BASE_URL}app/` })
      .catch((e) => console.error('Service worker registration failed:', e));
  }
}

bootstrap();
