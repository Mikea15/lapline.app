// main.ts - Application entry point
// Initializes stores, mounts root component.

import './styles/global.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { initStores } from './lib/stores.svelte';
import { requestPersistentStorage } from './lib/storage-persist';

async function bootstrap() {
  // Fire-and-forget - never delays startup, and the result only matters to
  // the browser's eviction policy, not to anything the app renders.
  requestPersistentStorage().then((result) => console.log(`Persistent storage: ${result}`));

  try {
    await initStores();
    console.log('Lapline initialized');
  } catch (e) {
    console.error('Failed to initialize stores:', e);
  }

  mount(App, { target: document.body });

  // Production only - under `vite dev` a cached app shell would fight HMR.
  // See scripts/pwa/vite-sw-plugin.ts for what the worker caches.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}app/sw.js`, { scope: `${import.meta.env.BASE_URL}app/` })
      .catch((e) => console.error('Service worker registration failed:', e));
  }
}

bootstrap();