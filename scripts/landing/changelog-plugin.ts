// scripts/landing/changelog-plugin.ts - build-time HTML for the static site
// pages around the app (the changelog and the guides under /guides/), in dev
// and in builds, so they're plain HTML that reads without JavaScript and
// search engines can index:
// - <!-- SITE_HEADER --> / <!-- SITE_FOOTER -->: the shared top bar and footer.
// - <!-- RELEASE_NOTES -->: every release from lib/release-notes.ts, the
//   same list the app's Release Notes panel shows.
import type { Plugin } from 'vite';
import { RELEASE_NOTES } from '../../src/lib/release-notes';
import { CONTACT_EMAIL, DONATE_URL } from '../../src/lib/links';

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

const SITE_HEADER = `<header class="l-top">
      <a class="l-brand" href="/?home" aria-label="Lapline home">
        <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
          <rect x="8" y="18" width="48" height="28" rx="14" fill="none" stroke="currentColor" stroke-width="6" />
          <line x1="40" y1="12" x2="40" y2="24" stroke="var(--accent)" stroke-width="6" stroke-linecap="round" />
        </svg>
        lapline
      </a>
      <a class="l-btn l-btn-quiet" href="/app/">Open app</a>
    </header>`;

const SITE_FOOTER = `<footer class="l-foot">
      <span>© 2026 Lapline · MIT licence</span>
      <a href="/?home#privacy">Privacy</a>
      <a href="/changelog/">What's new</a>
      <a href="/app/">Open app</a>
      <a href="mailto:${CONTACT_EMAIL}">Contact</a>${DONATE_URL ? `
      <a href="${DONATE_URL}" rel="noopener">Buy me a coffee</a>` : ''}
    </footer>`;

export function changelogPlugin(): Plugin {
  return {
    name: 'lapline-site-pages',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html
          .replace('<!-- SITE_HEADER -->', SITE_HEADER)
          .replace('<!-- SITE_FOOTER -->', SITE_FOOTER)
          .replace('<!-- RELEASE_NOTES -->', () => renderReleaseNotes());
      }
    }
  };
}
