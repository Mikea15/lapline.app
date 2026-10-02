// lib/logo.ts - the logo's start/finish tick runs two laps of the track
// when a page loads, then rests at its place on the top straight. The
// wordmark's final "e" is in the same accent colour, as if it were the
// finish line too (see WORDMARK_HTML). Shared by the
// app's sidebar wordmark (App.svelte) and the site header
// (scripts/landing/changelog-plugin.ts).
//
// The track is the logo's rounded rect (x 8-56, y 18-46, corner radius 14)
// and the tick sits on its top straight at x 40. The lap follows the track's
// centre line anticlockwise, the way runners go, as an offset from the
// tick's resting point; rotate="auto" turns the tick through the bends so it
// stays across the track. Before the animation starts, or without SMIL, the
// tick simply sits at rest.

const LAP = 'H-18 A14 14 0 0 0 -18 28 H2 A14 14 0 0 0 2 0 H0';
/** Two laps as one path, so the easing covers the whole run rather than
 *  slowing to a stop between laps. */
export const LOGO_LAP_PATH = `M0 0 ${LAP} ${LAP}`;

/** "lapline" with its last letter in the accent colour. */
export const WORDMARK_HTML = 'laplin<span class="wordmark-e">e</span>';

/** The tick: a line through its own origin, moved to rest at (40, 18). */
export function logoTickSvg(): string {
  return `<g transform="translate(40 18)"><g class="logo-tick"><line x1="0" y1="-6" x2="0" y2="6" stroke="var(--accent)" stroke-width="6" stroke-linecap="round" /><animateMotion dur="2.6s" begin="0.3s" fill="freeze" rotate="auto" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.45 0 0.2 1" path="${LOGO_LAP_PATH}" /></g></g>`;
}

/** Drops the lap for reduced motion, and replays it when the logo is hovered. */
export function initLogoLaps(root: ParentNode = document): void {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const anim of root.querySelectorAll<SVGAnimationElement>('.logo-tick animateMotion')) {
    if (reduce) {
      anim.remove();
      continue;
    }
    const svg = anim.closest('svg');
    const trigger = svg?.parentElement ?? svg;
    trigger?.addEventListener('mouseenter', () => anim.beginElement());
  }
}
