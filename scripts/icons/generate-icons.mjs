// scripts/icons/generate-icons.mjs
// Generates every app icon in public/icons/ from one definition of logo A,
// "the track": a running-track oval in chalk (#e8edf2) with a teal
// start/finish line (#3fd0c9), on the app's ground (#0a0c0f).
//
//   node scripts/icons/generate-icons.mjs
//
// SVGs are written directly; PNGs are rendered from them in headless
// Chromium (Playwright is already a dev dependency) so every size comes from
// the same geometry.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../public/icons');
const GROUND = '#0a0c0f';
const CHALK = '#e8edf2';
const TEAL = '#3fd0c9';

// The mark in a 512 box, centred. `scale` shrinks it about the centre (the
// maskable icon needs it inside the 80% safe circle).
function mark(scale = 1, stroke = 36) {
  return `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <rect x="80" y="174" width="352" height="208" rx="104" fill="none" stroke="${CHALK}" stroke-width="${stroke}"/>
    <line x1="316" y1="130" x2="316" y2="218" stroke="${TEAL}" stroke-width="${stroke}" stroke-linecap="round"/>
  </g>`;
}

// Rounded tile: browsers and desktop installs show it as-is.
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${GROUND}"/>
  ${mark(0.86)}
</svg>
`;

// Full-bleed square: Android masks it to its own shape and iOS rounds it, so
// no corners of our own, and the mark stays inside the central safe zone.
const fullBleedSvg = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${GROUND}"/>
  ${mark(scale)}
</svg>
`;

// Browser-tab favicon: drawn on a 32 grid with heavier strokes so it still
// reads at 16px, where the 512 geometry's lines would blur away.
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="${GROUND}"/>
  <rect x="4" y="11" width="24" height="14" rx="7" fill="none" stroke="${CHALK}" stroke-width="3.2"/>
  <line x1="20" y1="6.5" x2="20" y2="13" stroke="${TEAL}" stroke-width="3.2" stroke-linecap="round"/>
</svg>
`;

const pngs = [
  { file: 'icon-192.png', svg: iconSvg, size: 192, transparent: true },
  { file: 'icon-512.png', svg: iconSvg, size: 512, transparent: true },
  { file: 'icon-maskable-512.png', svg: fullBleedSvg(0.72), size: 512, transparent: false },
  { file: 'apple-touch-icon.png', svg: fullBleedSvg(0.8), size: 180, transparent: false },
  { file: 'favicon-32.png', svg: faviconSvg, size: 32, transparent: true }
];

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'icon.svg'), iconSvg);
writeFileSync(join(OUT, 'favicon.svg'), faviconSvg);

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, svg, size, transparent } of pngs) {
  const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${sized}`);
  await page.locator('svg').screenshot({ path: join(OUT, file), omitBackground: transparent });
  console.log(`wrote public/icons/${file}`);
}
await browser.close();
console.log('wrote public/icons/icon.svg, public/icons/favicon.svg');
