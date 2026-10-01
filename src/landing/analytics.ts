// landing/analytics.ts - visitor counts for the public pages (landing,
// changelog, guides). Unlike the app, these pages load SimpleAnalytics for
// every visitor: it's cookieless, collects no IP addresses or personal data
// and skips Do Not Track visitors. Its script counts page views and visitors
// on its own; this adds click events for the main buttons (elements with
// data-track="name") and for links that leave the site.
const SA_DOMAIN = import.meta.env.VITE_ANALYTICS_DOMAIN;

declare global {
  interface Window {
    sa_event?: (name: string, props?: Record<string, string | number | boolean>) => void;
  }
}

export function initPublicAnalytics() {
  if (!SA_DOMAIN || typeof document === 'undefined') return;
  const script = document.createElement('script');
  script.src = 'https://scripts.simpleanalyticscdn.com/latest.js';
  script.async = true;
  script.defer = true;
  script.setAttribute('data-hostname', SA_DOMAIN);
  document.head.appendChild(script);

  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest('a, button');
    if (!el) return;
    const tracked = el.getAttribute('data-track');
    if (tracked) return void window.sa_event?.(tracked);
    const href = el.getAttribute('href') ?? '';
    if (href.startsWith('mailto:')) return void window.sa_event?.('outbound_email');
    if (/^https?:\/\//.test(href)) {
      const host = new URL(href).hostname.replace(/^www\./, '');
      if (host !== SA_DOMAIN) window.sa_event?.(`outbound_${host.replace(/[^a-z0-9]+/gi, '_')}`);
    }
  });
}
