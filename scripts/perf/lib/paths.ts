// scripts/perf/lib/paths.ts - shared filesystem locations for the perf pipeline.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const REPORTS_DIR = path.join(ROOT, 'reports');
export const RAW_DIR = path.join(REPORTS_DIR, 'raw');
export const HISTORY_DIR = path.join(REPORTS_DIR, 'history');
export const LATEST_JSON = path.join(REPORTS_DIR, 'latest.json');
export const LATEST_MD = path.join(REPORTS_DIR, 'latest.md');
export const RAW_BUNDLE_JSON = path.join(RAW_DIR, 'bundle.json');
export const RAW_FUNCTIONS_JSON = path.join(RAW_DIR, 'functions.json');
export const RAW_PAGE_LOAD_JSON = path.join(RAW_DIR, 'page-load.json');
