// landing/main.ts - the landing page at / (index.html). The page is plain
// HTML; this only adds its styles and fills in the device import guides from
// the same data the app's Import dialog uses (lib/import-guides.ts).
import './landing.css';
import { IMPORT_GUIDES, stepParts } from '../lib/import-guides';

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

const host = document.getElementById('import-guides');
if (host) {
  for (const guide of IMPORT_GUIDES) {
    const details = document.createElement('details');
    details.className = 'l-guide';
    const summary = document.createElement('summary');
    summary.textContent = guide.name;
    const steps = document.createElement('ol');
    for (const step of guide.steps) {
      const li = document.createElement('li');
      li.append(rich(step));
      steps.append(li);
    }
    details.append(summary, steps);
    if (guide.note) {
      const note = document.createElement('p');
      note.append(rich(guide.note));
      details.append(note);
    }
    host.append(details);
  }
}

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
