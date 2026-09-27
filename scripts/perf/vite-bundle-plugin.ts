// scripts/perf/vite-bundle-plugin.ts
// Vite plugin that records each production build's output chunk/asset sizes
// (raw + gzip) to reports/raw/bundle.json, feeding the bundle-size half of
// the perf report. Only active for `vite build` (writeBundle doesn't fire
// for `vite dev`), and does nothing itself with regressions - report.ts
// compares this run's numbers against the previous report's baseline.

import { gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { RAW_DIR, RAW_BUNDLE_JSON } from './lib/paths.ts';

export interface BundleEntry {
  fileName: string;
  type: 'chunk' | 'asset';
  bytes: number;
  gzipBytes: number;
}

export function perfBundlePlugin(): Plugin {
  return {
    name: 'perf-bundle-report',
    apply: 'build',
    writeBundle(_options, bundle) {
      const entries: BundleEntry[] = [];
      for (const [fileName, output] of Object.entries(bundle)) {
        // Source maps balloon "size on disk" without shipping to users -
        // excluded so the tracked number matches what actually loads.
        if (fileName.endsWith('.map')) continue;
        const source = output.type === 'chunk' ? output.code : output.source;
        const buf = Buffer.from(source);
        const bytes = buf.byteLength;
        const gzipBytes = gzipSync(buf).length;
        entries.push({ fileName, type: output.type, bytes, gzipBytes });
      }
      entries.sort((a, b) => b.bytes - a.bytes);
      const totalBytes = entries.reduce((sum, e) => sum + e.bytes, 0);
      const totalGzipBytes = entries.reduce((sum, e) => sum + e.gzipBytes, 0);

      mkdirSync(RAW_DIR, { recursive: true });
      writeFileSync(RAW_BUNDLE_JSON, JSON.stringify({ totalBytes, totalGzipBytes, entries }, null, 2));
    }
  };
}
