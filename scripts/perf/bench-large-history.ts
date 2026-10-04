// scripts/perf/bench-large-history.ts
// Load test: seeds the built app's IndexedDB with a large synthetic history
// (500 / 2,000 / 5,000 activities by default, built from the real fixtures
// - see lib/synthetic-history.ts) and times boot, every screen, every
// Trends range and opening an activity, plus JS heap. Each step is timed
// inside the page, from the click to the moment no loading skeleton is
// left, so async work (records, critical pace, VO2max) counts, not just the
// first paint.
//
// Run with `npm run perf:large-history` after `npm run build` (port 4185).
// Options (environment): PERF_HISTORY_SIZES=500,2000; PERF_PASSES=1 for
// the first boot only; PERF_DIST=<dir> to serve another build;
// PERF_LABEL=<name> names the JSON written to reports/raw/; PERF_RESEED=1;
// PERF_VERBOSE=1 echoes the page's console. Each run gets a copy of the
// size's seeded on-disk profile (an in-memory one would hold millions of
// rows in RAM), deleted afterwards. Two passes: the first boot on that copy
// (which includes any schema upgrade, and whatever the app then derives in
// the background), then a reload.

import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { preview, type PreviewServer } from 'vite';
import { chromium, type BrowserContext, type CDPSession, type Page } from 'playwright';

import { loadStubActivities, syntheticDates } from './lib/synthetic-history.ts';
import { RAW_DIR, ROOT } from './lib/paths.ts';
import type { ParsedActivity } from '../../src/lib/types.ts';

const SIZES = (process.env.PERF_HISTORY_SIZES ?? '500,2000,5000').split(',').map(Number);
const PORT = Number(process.env.PERF_PORT ?? 4185);
const READY_TIMEOUT_MS = 300_000;
const PASSES = Number(process.env.PERF_PASSES ?? 2);
const RANGES = ['7d', '4w', '12w', '1y', 'All'];
const SCREENS = ['Activities', 'Trends', 'Records', 'Today'];

interface Step {
  name: string;
  /** Click to two painted frames - what bench-page-load.ts calls a navigation. */
  settledMs: number;
  /** Click until no loading skeleton is left (null: still loading at the timeout). */
  readyMs: number | null;
  peakHeapMb: number;
}

interface SizeResult {
  activities: number;
  records: number;
  seedMs: number;
  storageMb: number;
  passes: { label: string; steps: Step[]; heapAfterGcMb: number }[];
}

// Runs in the page: writes the history straight into IndexedDB in the
// shape saveActivities() leaves it (activity rows, then one row per record,
// lap and pool length), in batched transactions.
async function seedInPage(arg: { stubs: ParsedActivity[]; plan: { s: number; date: string }[] }): Promise<number> {
  const { stubs, plan } = arg;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('HealthTracker');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  console.log(`seed: db v${db.version}, stores ${Array.from(db.objectStoreNames).join(',')}`);
  const t0 = performance.now();
  const BATCH = 20;
  for (let start = 0; start < plan.length; start += BATCH) {
    const tx = db.transaction(['activities', 'activityRecords', 'activityLaps', 'activityLengths'], 'readwrite');
    const acts = tx.objectStore('activities');
    const recs = tx.objectStore('activityRecords');
    const laps = tx.objectStore('activityLaps');
    const lens = tx.objectStore('activityLengths');
    for (let i = start; i < Math.min(plan.length, start + BATCH); i++) {
      const { s, date } = plan[i]!;
      const stub = stubs[s]!;
      const activityId = i + 1;
      acts.add({ ...stub.activity, id: activityId, date });
      for (const r of stub.records) recs.add({ ...r, activityId });
      for (const l of stub.laps) laps.add({ ...l, activityId });
      for (const l of stub.lengths) lens.add({ ...l, activityId });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    console.log(`seeded ${Math.min(plan.length, start + BATCH)}`);
  }
  const tx = db.transaction('settings', 'readwrite');
  tx.objectStore('settings').put({ key: 'has_seen_welcome', value: 'true' });
  await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
  db.close();
  return performance.now() - t0;
}

// Runs in the page: clicks `el` and times two painted frames (settled),
// then frames until no `.skeleton` is left (ready).
async function timeClickInPage(el: Element, timeoutMs: number): Promise<{ settledMs: number; readyMs: number | null }> {
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  const t0 = performance.now();
  (el as HTMLElement).click();
  await frame();
  await frame();
  const settledMs = performance.now() - t0;
  while (document.querySelector('.skeleton')) {
    if (performance.now() - t0 > timeoutMs) return { settledMs, readyMs: null };
    await frame();
  }
  return { settledMs, readyMs: performance.now() - t0 };
}

// Runs in the page right after a reload: time from navigation start to the
// wordmark, then to Today showing data with nothing left loading.
async function bootInPage(timeoutMs: number): Promise<{ wordmarkMs: number; readyMs: number | null }> {
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  while (!document.querySelector('.wordmark')) await frame();
  const wordmarkMs = performance.now();
  // Ready: Today's KPI cards are up, nothing shows a skeleton, and the
  // sidebar's Records badge has a real count ('—' while records compute; it
  // reads 0 for a moment before the history has loaded).
  const recordsBadge = () =>
    Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith('Records'))
      ?.querySelector('.sidebar-nav-badge')
      ?.textContent?.trim();
  const ready = () => {
    const badge = recordsBadge();
    return !!document.querySelector('.kpi-cards') && !document.querySelector('.skeleton') && !!badge && badge !== '—' && badge !== '0';
  };
  let lastLog = 0;
  while (!ready()) {
    if (performance.now() > timeoutMs) return { wordmarkMs, readyMs: null };
    if (performance.now() - lastLog > 5000) {
      lastLog = performance.now();
      console.log(`boot: records badge ${recordsBadge()}, ${document.querySelectorAll('.skeleton').length} skeletons`);
    }
    await frame();
  }
  return { wordmarkMs, readyMs: performance.now() };
}

// Runs in the page after boot: time from navigation start until the
// background fill of the per-activity best-efforts table (the first boot
// after the v8 upgrade) has a row for every activity - null if it hasn't by
// the timeout, or the table isn't there (an older build).
async function fillCompleteInPage(arg: { total: number; timeoutMs: number }): Promise<number | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('HealthTracker');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    if (!db.objectStoreNames.contains('activityEfforts')) return null;
    const count = () =>
      new Promise<number>((resolve, reject) => {
        const req = db.transaction('activityEfforts').objectStore('activityEfforts').count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    while ((await count()) < arg.total) {
      if (performance.now() > arg.timeoutMs) return null;
      await new Promise((r) => setTimeout(r, 250));
    }
    return performance.now();
  } finally {
    db.close();
  }
}

class HeapSampler {
  private peak = 0;
  private timer: NodeJS.Timeout | null = null;
  constructor(private cdp: CDPSession) {}
  async heapMb(): Promise<number> {
    const { metrics } = await this.cdp.send('Performance.getMetrics');
    const used = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
    return used / 1024 / 1024;
  }
  start() {
    this.peak = 0;
    this.timer = setInterval(() => {
      this.heapMb().then(
        (mb) => (this.peak = Math.max(this.peak, mb)),
        () => {}
      );
    }, 50);
  }
  async stop(): Promise<number> {
    if (this.timer) clearInterval(this.timer);
    this.peak = Math.max(this.peak, await this.heapMb());
    return Math.round(this.peak);
  }
}

async function timeClick(heap: HeapSampler, name: string, locator: ReturnType<Page['locator']>): Promise<Step> {
  log(name);
  const el = await locator.elementHandle();
  if (!el) throw new Error(`${name}: nothing to click`);
  heap.start();
  const r = await el.evaluate(timeClickInPage, READY_TIMEOUT_MS);
  const peakHeapMb = await heap.stop();
  return { name, settledMs: Math.round(r.settledMs), readyMs: r.readyMs === null ? null : Math.round(r.readyMs), peakHeapMb };
}

const t0 = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

const navButton = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) }).first();

// After an untimed click, wait for its loading to finish so it can't spill
// into the next timed step.
async function untilReady(page: Page) {
  await page.waitForFunction(() => !document.querySelector('.skeleton'), null, { polling: 'raf', timeout: READY_TIMEOUT_MS });
}

async function runPass(page: Page, cdp: CDPSession, heap: HeapSampler, label: string, baseUrl: string, total: number): Promise<SizeResult['passes'][number]> {
  const steps: Step[] = [];
  log(`boot (${label})`);
  heap.start();
  await page.goto(baseUrl, { waitUntil: 'commit' });
  const boot = await page.evaluate(bootInPage, READY_TIMEOUT_MS);
  steps.push({
    name: 'boot (to Today ready)',
    settledMs: Math.round(boot.wordmarkMs),
    readyMs: boot.readyMs === null ? null : Math.round(boot.readyMs),
    peakHeapMb: await heap.stop()
  });
  const fillMs = await page.evaluate(fillCompleteInPage, { total, timeoutMs: READY_TIMEOUT_MS });
  if (fillMs !== null) steps.push({ name: 'efforts fill complete', settledMs: 0, readyMs: Math.round(fillMs), peakHeapMb: 0 });

  for (const round of ['first', 'repeat']) {
    for (const s of SCREENS) steps.push(await timeClick(heap, `nav.${s.toLowerCase()} (${round})`, navButton(page, s)));
  }

  await navButton(page, 'Trends').click();
  await untilReady(page);
  for (const r of RANGES) {
    steps.push(await timeClick(heap, `trends.range.${r}`, page.getByRole('button', { name: r, exact: true })));
  }
  await page.getByRole('button', { name: '1y', exact: true }).click();
  await untilReady(page);

  await navButton(page, 'Activities').click();
  await untilReady(page);
  await page.locator('tr.clickable-row').first().waitFor();
  steps.push(await timeClick(heap, 'activity.open', page.locator('tr.clickable-row button').first()));
  await page.getByText('‹ All activities').waitFor();
  await navButton(page, 'Today').click();
  await untilReady(page);

  await cdp.send('HeapProfiler.collectGarbage');
  const heapAfterGcMb = Math.round(await heap.heapMb());
  return { label, steps, heapAfterGcMb };
}

function attachLogging(page: Page) {
  page.on('pageerror', (e) => log(`page error: ${e.message}`));
  if (process.env.PERF_VERBOSE) page.on('console', (m) => log(`console: ${m.text()}`));
}

// Seeding writes millions of rows at ~10k/s, so each size's seeded profile
// is kept in the OS temp folder and copied for every run: before and after
// a change measure the same data, and the copy exercises the real upgrade
// path when the app's schema has moved on since. PERF_RESEED=1 rebuilds it.
async function seededProfile(baseUrl: string, stubs: ParsedActivity[], count: number): Promise<{ dir: string; seedMs: number; records: number }> {
  // IndexedDB belongs to the origin, so the profile only works on the same port.
  const dir = path.join(tmpdir(), `lapline-perf-seed-${PORT}-${count}`);
  const marker = path.join(dir, 'lapline-seeded.json');
  if (!process.env.PERF_RESEED && existsSync(marker)) return { dir, ...(JSON.parse(readFileSync(marker, 'utf8')) as { seedMs: number; records: number }) };
  rmSync(dir, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(dir, { viewport: { width: 1400, height: 900 } });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    attachLogging(page);
    // Boot once on the empty profile so the app creates the database at
    // its current schema, then write the history into it.
    log(`${count}: empty boot`);
    await page.goto(baseUrl);
    await page.locator('.wordmark').waitFor();
    log(`${count}: seeding`);
    const plan = syntheticDates(count).map((date, i) => ({ s: i % stubs.length, date }));
    const seedMs = Math.round(await page.evaluate(seedInPage, { stubs, plan }));
    const records = plan.reduce((n, p) => n + stubs[p.s]!.records.length, 0);
    await context.close();
    writeFileSync(marker, JSON.stringify({ seedMs, records }));
    return { dir, seedMs, records };
  } catch (e) {
    await context.close();
    throw e;
  }
}

async function runSize(baseUrl: string, stubs: ParsedActivity[], count: number): Promise<SizeResult> {
  const seed = await seededProfile(baseUrl, stubs, count);
  const profile = mkdtempSync(path.join(tmpdir(), 'lapline-perf-run-'));
  let context: BrowserContext | null = null;
  try {
    log(`${count}: copying the seeded profile`);
    cpSync(seed.dir, profile, { recursive: true });
    context = await chromium.launchPersistentContext(profile, { viewport: { width: 1400, height: 900 } });
    const page = context.pages()[0] ?? (await context.newPage());
    attachLogging(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const heap = new HeapSampler(cdp);

    const passes = [];
    passes.push(await runPass(page, cdp, heap, 'first boot', baseUrl, count));
    if (PASSES > 1) passes.push(await runPass(page, cdp, heap, 'reload', baseUrl, count));
    const storageMb = await page.evaluate(async () => ((await navigator.storage.estimate()).usage ?? 0) / 1024 / 1024);
    return { activities: count, records: seed.records, seedMs: seed.seedMs, storageMb: Math.round(storageMb), passes };
  } finally {
    await context?.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

function printSize(r: SizeResult) {
  console.log(`\n=== ${r.activities} activities, ${r.records.toLocaleString()} records (seeded in ${r.seedMs} ms, ${r.storageMb} MB on disk) ===`);
  for (const p of r.passes) {
    console.log(`-- ${p.label} (heap after GC: ${p.heapAfterGcMb} MB)`);
    for (const s of p.steps) {
      const ready = s.readyMs === null ? `>${READY_TIMEOUT_MS}` : String(s.readyMs);
      console.log(`  ${s.name.padEnd(28)} settled ${String(s.settledMs).padStart(7)} ms  ready ${ready.padStart(7)} ms  peak heap ${String(s.peakHeapMb).padStart(5)} MB`);
    }
  }
}

export async function runLargeHistoryBenchmarks(): Promise<SizeResult[]> {
  const server: PreviewServer = await preview({
    configFile: path.join(ROOT, 'vite.config.ts'),
    ...(process.env.PERF_DIST ? { build: { outDir: process.env.PERF_DIST } } : {}),
    preview: { port: PORT, strictPort: true }
  });
  const siteUrl = server.resolvedUrls?.local[0];
  const baseUrl = siteUrl ? new URL('app/', siteUrl).href : undefined;
  if (!baseUrl) throw new Error('vite preview did not report a URL - was `npm run build` (dist/) produced first?');
  const stubs = await loadStubActivities({ gpx: true });
  const results: SizeResult[] = [];
  try {
    for (const n of SIZES) {
      const r = await runSize(baseUrl, stubs, n);
      printSize(r);
      results.push(r);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.httpServer.close((err) => (err ? reject(err) : resolve())));
  }
  return results;
}

const results = await runLargeHistoryBenchmarks();
mkdirSync(RAW_DIR, { recursive: true });
const out = path.join(RAW_DIR, `large-history${process.env.PERF_LABEL ? `-${process.env.PERF_LABEL}` : ''}.json`);
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`\n[perf] wrote ${path.relative(ROOT, out)}`);
