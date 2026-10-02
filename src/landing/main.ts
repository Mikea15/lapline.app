// landing/main.ts - the site pages around the app (the home page, guides and
// changelog). The pages are plain HTML; this adds their styles, the theme
// toggle in the shared header, and on the home page the decorative charts,
// the hero's speedlines, the per-device export
// steps (the same data as the app's Import dialog, lib/import-guides.ts)
// and the tour video.
import './landing.css';
import { IMPORT_GUIDES, stepParts } from '../lib/import-guides';
import { initPublicAnalytics } from './analytics';
import { applyTheme, currentTheme, getThemePref, setThemePref, watchTheme } from '../lib/theme';
import { startSpeedlines } from './speedlines';
import { initLogoLaps } from '../lib/logo';

initPublicAnalytics();
initLogoLaps();

// ----- Theme toggle (every site page) -----

applyTheme(getThemePref());
watchTheme();

const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/></svg>';

const themeBtn = document.querySelector<HTMLButtonElement>('.l-theme');
if (themeBtn) {
  const render = () => {
    const dark = currentTheme() === 'dark';
    themeBtn.innerHTML = dark ? SUN : MOON;
    const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
    themeBtn.setAttribute('aria-label', label);
    themeBtn.title = label;
  };
  render();
  themeBtn.hidden = false;
  themeBtn.addEventListener('click', () => setThemePref(currentTheme() === 'dark' ? 'light' : 'dark'));
  window.addEventListener('lapline-theme', render);
}

// ----- Decorative mini-charts (design_handoff_landing/viz-data.json) -----

// Seeded so the charts look the same on every visit.
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

type Bar = [height: number, colour: string];
const Z = ['var(--zone-1)', 'var(--zone-1)', 'var(--zone-2)', 'var(--zone-2)', 'var(--zone-3)', 'var(--zone-3)', 'var(--zone-3)', 'var(--zone-4)', 'var(--zone-4)', 'var(--zone-5)'];
const N = 'var(--line-chip)';
const A = 'var(--accent)';

function vizBars(name: string): Bar[] {
  const r = rng(9);
  switch (name) {
    case 'today':
      return [30, 42, 38, 0, 0, 52, 50, 44, 56, 70, 82, 86, 90, 94].map((h, i) => [h, i >= 11 ? 'var(--zone-4)' : i >= 9 ? A : N]);
    case 'session':
      return Array.from({ length: 22 }, (_, i) => {
        const h = 40 + Math.sin(i / 2.4) * 22 + r() * 18;
        return [h, Z[Math.min(9, Math.floor(h / 10))]!];
      });
    case 'trends':
      return [8, 14, 22, 34, 52, 74, 92, 100, 84, 62, 40, 24, 14, 8].map((h, i) => [h, i === 7 ? A : 'var(--accent-deep)']);
    case 'records':
      return [100, 88, 78, 70, 64, 60, 57, 54, 52, 50, 49, 48, 47, 46].map((h, i) => [h, i === 0 || i === 4 || i === 9 ? A : N]);
    case 'calendar':
      return Array.from({ length: 21 }, () => {
        const on = r() < 0.6;
        return on ? [30 + r() * 70, [A, 'var(--zone-3)', 'var(--zone-1)'][Math.floor(r() * 3)]!] : [6, N];
      });
    case 'offline':
      return Array.from({ length: 14 }, (_, i) => [12, i < 3 ? A : 'var(--line-soft)']);
    case 'phone-load': {
      const vals = [30, 42, 38, 0, 0, 52, 50, 44, 56, 70, 82, 86];
      return vals.map((v, i) => [Math.max(4, (v / 86) * 100), i === 11 ? 'var(--zone-4)' : i >= 9 ? A : N]);
    }
  }
  return [];
}

for (const el of document.querySelectorAll<HTMLElement>('[data-viz]')) {
  for (const [h, c] of vizBars(el.dataset.viz!)) {
    const bar = document.createElement('span');
    bar.style.height = `${h.toFixed(0)}%`;
    bar.style.background = c;
    el.append(bar);
  }
}

// ----- Hero speedlines -----

const speed = document.querySelector<HTMLCanvasElement>('.h-speed');
if (speed) startSpeedlines(speed);

// ----- Per-device export steps -----

function rich(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const part of stepParts(text)) {
    if (part.bold) {
      const b = document.createElement('strong');
      b.textContent = part.text;
      frag.append(b);
    } else {
      frag.append(part.text);
    }
  }
  return frag;
}

const chips = document.getElementById('import-guides');
const steps = document.getElementById('import-steps');
if (chips && steps) {
  chips.replaceChildren();
  const buttons: HTMLButtonElement[] = [];
  IMPORT_GUIDES.forEach((guide) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'h-chip';
    btn.textContent = guide.name;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'import-steps');
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      for (const b of buttons) b.setAttribute('aria-expanded', 'false');
      steps.hidden = !open;
      if (!open) return;
      btn.setAttribute('aria-expanded', 'true');
      const list = document.createElement('ol');
      for (const step of guide.steps) {
        const li = document.createElement('li');
        li.append(rich(step));
        list.append(li);
      }
      steps.replaceChildren(list);
      if (guide.note) {
        const note = document.createElement('p');
        note.append(rich(guide.note));
        steps.append(note);
      }
      window.sa_event?.(`landing_guide_${guide.name.toLowerCase().replace(/\W+/g, '_')}`);
    });
    buttons.push(btn);
    chips.append(btn);
  });
}

// ----- Tour video -----

// The tour video replaces the still screenshot once the page has loaded -
// added late so a video that's slow (or never ready) can't hold up the
// page, and only where WebM plays. Anywhere else the screenshot stays.
function attachTour() {
  const still = document.querySelector<HTMLImageElement>('img.l-video');
  const video = document.createElement('video');
  if (!still || !video.canPlayType('video/webm')) return;
  Object.assign(video, { autoplay: true, muted: true, loop: true, playsInline: true, poster: still.src });
  video.className = 'l-video';
  video.setAttribute('aria-label', 'A 20-second tour of Lapline with the sample data');
  video.src = '/landing/tour.webm';
  // Swap only once it can actually play, so a failed load leaves the still.
  video.addEventListener('canplay', () => still.replaceWith(video), { once: true });
  video.load();
}
if (document.readyState === 'complete') attachTour();
else window.addEventListener('load', attachTour, { once: true });
