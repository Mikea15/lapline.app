// scripts/landing/changelog-plugin.ts - build-time HTML for the static site
// pages around the app (the changelog and the guides under /guides/), in dev
// and in builds, so they're plain HTML that reads without JavaScript and
// search engines can index:
// - <!-- SITE_HEADER --> / <!-- SITE_FOOTER -->: the shared top bar and footer.
// - <!-- RELEASE_NOTES -->: every release from lib/release-notes.ts, the
//   same list the app's Release Notes panel shows.
// - every page (the app's too) gets lib/theme.ts's inline theme script in
//   its <head>, so a light-theme page never flashes dark first.
import type { Plugin } from 'vite';
import { RELEASE_NOTES } from '../../src/lib/release-notes';
import { CONTACT_EMAIL, DONATE_URL, X_URL } from '../../src/lib/links';
import { PREPAINT_THEME_SCRIPT } from '../../src/lib/theme';
import { logoTickSvg, WORDMARK_HTML } from '../../src/lib/logo';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function renderReleaseNotes(): string {
  return RELEASE_NOTES.map(
    (r) => `<section class="l-release" id="v${escape(r.version)}">
  <h2>${escape(r.version)} <span class="l-release-date">${escape(formatDate(r.date))}</span></h2>
  <ul>${r.changes.map((c) => `\n    <li>${escape(c)}</li>`).join('')}
  </ul>
</section>`
  ).join('\n');
}

// The theme toggle is filled in by src/landing/theme-toggle.ts; without JS
// it stays hidden (the page follows the saved or system theme anyway).
const SITE_HEADER = `<header class="l-top">
      <div class="l-top-inner">
        <a class="l-brand" href="/?home" aria-label="Lapline home">
          <svg width="20" height="20" viewBox="0 0 64 64" aria-hidden="true">
            <rect x="8" y="18" width="48" height="28" rx="14" fill="none" stroke="currentColor" stroke-width="6" />
            ${logoTickSvg()}
          </svg>
          <span>${WORDMARK_HTML}</span>
        </a>
        <nav class="l-nav" aria-label="Site">
          <a href="/?home#features">Features</a>
          <a href="/?home#privacy">Privacy</a>
          <a href="/?home#files">Your workouts</a>
          <a href="/?home#faq">FAQ</a>
        </nav>
        <button type="button" class="l-theme" hidden aria-label="Switch to light theme"></button>
        <a class="l-btn l-btn-primary l-btn-quiet" href="/app/" data-track="landing_open_app">Open app</a>
      </div>
    </header>`;

const SITE_FOOTER = `<footer class="l-foot">
      <div class="l-foot-inner">
        <span class="l-foot-legal">© 2026 Lapline · MIT licence</span>
        <nav class="l-foot-links" aria-label="Footer">
          <a href="/?home#privacy">Privacy</a>
          <a href="/changelog/">What's new</a>
          <a href="mailto:${CONTACT_EMAIL}">Contact</a>
          <a href="${X_URL}" rel="noopener">X</a>${DONATE_URL ? `
          <a href="${DONATE_URL}" rel="noopener">Buy me a coffee</a>` : ''}
        </nav>
      </div>
    </footer>`;

export function changelogPlugin(): Plugin {
  return {
    name: 'lapline-site-pages',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return {
          html: html
            .replace('<!-- SITE_HEADER -->', SITE_HEADER)
            .replace('<!-- SITE_FOOTER -->', SITE_FOOTER)
            .replace('<!-- RELEASE_NOTES -->', () => renderReleaseNotes()),
          tags: [{ tag: 'script', children: PREPAINT_THEME_SCRIPT, injectTo: 'head' }]
        };
      }
    }
  };
}
