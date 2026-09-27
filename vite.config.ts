import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { perfBundlePlugin } from './scripts/perf/vite-bundle-plugin.ts';
import { serviceWorkerPlugin } from './scripts/pwa/vite-sw-plugin.ts';
import { changelogPlugin } from './scripts/landing/changelog-plugin.ts';

// Search-friendly guide pages at /guides/<slug>/ (see scripts/landing/).
const GUIDE_PAGES = ['open-fit-file', 'garmin-fit-file-without-uploading', 'critical-pace', 'heart-rate-zones-from-fit-file'];

export default defineConfig({
  plugins: [svelte(), perfBundlePlugin(), serviceWorkerPlugin(), changelogPlugin()],
  build: {
    target: 'es2022',
    minify: 'esbuild',
    // The landing page at /, the app itself at /app/, the changelog and the guides.
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
        changelog: fileURLToPath(new URL('./changelog/index.html', import.meta.url)),
        ...Object.fromEntries(
          GUIDE_PAGES.map((slug) => [`guide-${slug}`, fileURLToPath(new URL(`./guides/${slug}/index.html`, import.meta.url))])
        )
      }
    }
  },
  // fit-parser.worker.ts dynamically imports the fit-file-parser package,
  // which needs ES-module code-splitting support - Vite's default worker
  // output format ('iife') can't do that.
  worker: {
    format: 'es'
  },
  server: {
    port: 8080
  },
  resolve: {
    alias: {
      '$lib': '/src/lib',
      '$components': '/src/components'
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});