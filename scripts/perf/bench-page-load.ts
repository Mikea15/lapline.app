// scripts/perf/bench-page-load.ts
// Drives the built app (from `dist/`, via `vite preview`) with headless
// Chromium and times real user-facing moments: cold boot, switching between
// screens, importing .fit files, and opening an activity's detail view.
// Run standalone with `npm run perf:page-load` (requires `npm run build`'s
// `vite build` step to have produced dist/ first), or as part of
// `npm run build` via report.ts.

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { preview, type PreviewServer } from 'vite';
import { chromium, type Browser } from 'playwright';

import { summarize, type TimingResult } from './lib/timeit.ts';
import { ROOT } from './lib/paths.ts';

const STUB_DIR = path.join(ROOT, 'test-fixtures');
const ITERATIONS = Number(process.env.PERF_PAGELOAD_ITERATIONS ?? 3);
const SCREENS: { label: string; navName: string }[] = [
  { label: 'activities', navName: 'Activities' },
  { label: 'trends', navName: 'Trends' },
  { label: 'records', navName: 'Records' },
  { label: 'today', navName: 'Today' }
];

async function settle(page: import('playwright').Page) {
  // Waits two animation frames so a click's resulting re-render has actually
  // painted before the clock stops, without depending on network activity
  // (everything after boot is client-side/IndexedDB, so networkidle doesn't
  // fire the way it would for a page that fetches data per navigation).
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

async function runOneIteration(baseUrl: string, browser: Browser, samples: Record<string, number[]>) {
  const context = await browser.newContext();
  const page = await context.newPage();

  const bootStart = Date.now();
  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.locator('.wordmark').waitFor();
  (samples['boot.wallClock'] ??= []).push(Date.now() - bootStart);

  const nav = await page.evaluate(() => {
    const e = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      domContentLoaded: e ? e.domContentLoadedEventEnd - e.startTime : null,
      load: e ? e.loadEventEnd - e.startTime : null,
      firstContentfulPaint: fcp ? fcp.startTime : null
    };
  });
  if (nav.domContentLoaded !== null) (samples['boot.domContentLoaded'] ??= []).push(nav.domContentLoaded);
  if (nav.load !== null) (samples['boot.load'] ??= []).push(nav.load);
  // Headless Chromium doesn't always buffer a first-contentful-paint entry
  // (paint timing can be flaky without a real compositor) - recorded when
  // present, but a run legitimately short on samples here isn't a bug.
  if (nav.firstContentfulPaint !== null) (samples['boot.firstContentfulPaint'] ??= []).push(nav.firstContentfulPaint);

  // A fresh (activity-less) context boots straight into the first-time-user
  // Welcome modal - dismiss it before driving the rest of the flow, same as
  // a real first-time user would, so it doesn't block every click below.
  const welcomeExplore = page.getByRole('button', { name: "I'll explore first" });
  if (await welcomeExplore.isVisible().catch(() => false)) {
    await welcomeExplore.click();
  }

  // Screen switches before any data is imported (empty states).
  for (const s of SCREENS) {
    const t0 = Date.now();
    await page.getByRole('button', { name: new RegExp(`^${s.navName}`) }).click();
    await settle(page);
    (samples[`nav.${s.label}.emptyState`] ??= []).push(Date.now() - t0);
  }

  // Import every stub .fit file - exercises the real worker-pool parse path.
  const stubFiles = readdirSync(STUB_DIR).filter((f) => f.toLowerCase().endsWith('.fit')).map((f) => path.join(STUB_DIR, f));
  await page.getByRole('button', { name: 'Sync' }).click();
  const importStart = Date.now();
  await page.locator('#fit-import').setInputFiles(stubFiles);
  await page.getByText(/Import (complete|finished with errors)/).waitFor({ timeout: 60_000 });
  (samples[`import.${stubFiles.length}Files`] ??= []).push(Date.now() - importStart);
  await page.getByRole('button', { name: 'Close' }).click();

  // Screen switches again now that real activities/records/charts exist.
  for (const s of SCREENS) {
    const t0 = Date.now();
    await page.getByRole('button', { name: new RegExp(`^${s.navName}`) }).click();
    await settle(page);
    (samples[`nav.${s.label}.withData`] ??= []).push(Date.now() - t0);
  }

  // Open one activity's detail view - the heaviest single screen (route map,
  // charts, splits table all render from one click).
  await page.getByRole('button', { name: new RegExp('^Activities') }).click();
  await settle(page);
  const detailStart = Date.now();
  await page.locator('tr.clickable-row').first().click();
  await page.getByText('‹ All activities').waitFor();
  await settle(page);
  (samples['activityDetail.open'] ??= []).push(Date.now() - detailStart);

  await context.close();
}

export async function runPageLoadBenchmarks(): Promise<TimingResult[]> {
  const server: PreviewServer = await preview({ configFile: path.join(ROOT, 'vite.config.ts'), preview: { port: 0 } });
  const siteUrl = server.resolvedUrls?.local[0];
  // The app lives at /app/ (the site root is the landing page).
  const baseUrl = siteUrl ? new URL('app/', siteUrl).href : undefined;
  if (!baseUrl) throw new Error('vite preview did not report a URL - was `npm run build` (dist/) produced first?');

  const browser = await chromium.launch();
  const samples: Record<string, number[]> = {};
  try {
    for (let i = 0; i < ITERATIONS; i++) {
      await runOneIteration(baseUrl, browser, samples);
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.httpServer.close((err) => (err ? reject(err) : resolve())));
  }

  return Object.entries(samples).map(([name, values]) => summarize(name, values));
}
