// landing/speedlines.ts - the home page hero's animated background: streaks
// flying out of a vanishing point toward the viewer, like running into the
// screen (design_handoff_landing/viz-data.json → speedlines). Decorative
// and aria-hidden. Pauses while the tab is hidden or the hero is scrolled
// away; with reduced motion the streaks hold still.
import { currentTheme } from '../lib/theme';

const COLOURS = {
  dark: ['63,208,201', '63,208,201', '124,196,90', '141,154,168', '141,154,168'],
  light: ['22,163,156', '22,163,156', '79,154,47', '120,130,142', '120,130,142']
};
const GREYS = new Set(['141,154,168', '120,130,142']);

interface Streak {
  x: number;
  y: number;
  z: number;
  pz: number;
  c: string;
  w: number;
}

export function startSpeedlines(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let palette = COLOURS[currentTheme()];
  let W = 0;
  let H = 0;
  let vx = 0;
  let vy = 0;
  let F = 0;
  const lines: Streak[] = [];

  const spawn = (l: Streak, fresh: boolean): Streak => {
    const a = Math.random() * Math.PI * 2;
    const r = 0.15 + Math.random() * 0.85;
    l.x = Math.cos(a) * r;
    l.y = Math.sin(a) * r * 0.62;
    l.z = fresh ? Math.random() : 1;
    l.pz = l.z;
    l.c = palette[(Math.random() * palette.length) | 0]!;
    l.w = 0.6 + Math.random() * 1.3;
    return l;
  };

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    vx = W * 0.66;
    vy = H * 0.34;
    F = Math.max(W, H) * 0.9;
    const n = Math.round(Math.min(220, (W * H) / 5200));
    while (lines.length < n) lines.push(spawn({} as Streak, true));
    lines.length = n;
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  // A theme switch recolours every streak at once.
  window.addEventListener('lapline-theme', () => {
    palette = COLOURS[currentTheme()];
    for (const l of lines) l.c = palette[(Math.random() * palette.length) | 0]!;
  });

  let last = performance.now();
  let n = 0;
  let onScreen = true;
  const frame = (t: number) => {
    requestAnimationFrame(frame);
    if ((n++ & 15) === 0) {
      const r = canvas.getBoundingClientRect();
      onScreen = r.bottom > 0 && r.top < (window.innerHeight || H);
    }
    if (!onScreen || document.hidden) {
      last = t;
      return;
    }
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    const speed = reduce ? 0 : 0.42;
    const light = currentTheme() === 'light';
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    for (const l of lines) {
      l.pz = l.z;
      l.z -= speed * dt * (0.6 + (1 - l.z) * 0.8);
      if (l.z <= 0.02) {
        spawn(l, false);
        continue;
      }
      const tail = reduce ? l.z + 0.06 : Math.min(1, l.pz + 0.05 + (1 - l.z) * 0.18);
      const x1 = vx + (l.x / l.z) * F * 0.5;
      const y1 = vy + (l.y / l.z) * F * 0.5;
      const x0 = vx + (l.x / tail) * F * 0.5;
      const y0 = vy + (l.y / tail) * F * 0.5;
      if (x1 < -50 || x1 > W + 50 || y1 < -50 || y1 > H + 50) {
        spawn(l, false);
        continue;
      }
      const near = 1 - l.z;
      const alpha = (light ? Math.min(0.6, near * near) : Math.min(0.55, near * near * 0.9)) * (GREYS.has(l.c) ? 0.6 : 1);
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(${l.c},0)`);
      g.addColorStop(1, `rgba(${l.c},${alpha.toFixed(3)})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = l.w * (0.4 + near * 1.6);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(vx, vy, 0, vx, vy, Math.min(W, H) * 0.35);
    const accent = palette[0]!;
    glow.addColorStop(0, `rgba(${accent},.10)`);
    glow.addColorStop(1, `rgba(${accent},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  };
  requestAnimationFrame(frame);
}
