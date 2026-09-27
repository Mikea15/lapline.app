// lib/analytics.ts
// Provider-agnostic usage analytics. Screen views, coarse feature
// interactions, and (automatically, from the provider's own script) basic
// device/browser info - never activity content or anything else imported
// into this app. Kept behind AnalyticsProvider so swapping providers later
// (the bug list already flags this as a "for now" choice) means writing a
// new adapter, not touching every call site.
//
// Respects the user's Settings > "Share anonymous usage analytics" toggle
// (opt-in, off by default - see settingsStore.getAnalyticsEnabled) - no
// provider script loads and no event ever fires while that's off.

export interface AnalyticsProvider {
  init(): void;
  pageview(path: string): void;
  event(name: string, props?: Record<string, string | number | boolean>): void;
}

declare global {
  interface Window {
    sa_pageview?: (path: string) => void;
    sa_event?: (name: string, props?: Record<string, string | number | boolean>) => void;
  }
}

const SA_DOMAIN = import.meta.env.VITE_ANALYTICS_DOMAIN;

// SimpleAnalytics (https://docs.simpleanalytics.com) - cookieless, collects
// no personal data or IP addresses, and skips visitors with Do Not Track on
// by default (left as their default here rather than overridden). Its
// script auto-captures pageviews plus basic device/browser/OS info with no
// extra code; data-auto-collect="false" turns off the *automatic* pageview
// fire (which would use the raw document path, meaningless for a
// hash-routed single-page app) so pageview() below can report this app's
// own screen names instead.
class SimpleAnalyticsProvider implements AnalyticsProvider {
  private loaded = false;

  init() {
    if (this.loaded || !SA_DOMAIN || typeof document === 'undefined') return;
    this.loaded = true;
    const script = document.createElement('script');
    script.src = 'https://scripts.simpleanalyticscdn.com/latest.js';
    script.async = true;
    script.defer = true;
    script.setAttribute('data-hostname', SA_DOMAIN);
    script.setAttribute('data-auto-collect', 'false');
    document.head.appendChild(script);
  }

  pageview(path: string) {
    window.sa_pageview?.(path);
  }

  event(name: string, props?: Record<string, string | number | boolean>) {
    window.sa_event?.(name, props);
  }
}

const provider: AnalyticsProvider = new SimpleAnalyticsProvider();
let enabled = false;

// Called once at startup (and whenever the Settings toggle changes) with
// the user's current opt-in choice. Turning it on loads the provider
// script; turning it off just stops future calls - already-sent data isn't
// something this app can recall from the provider's side.
export function setAnalyticsEnabled(next: boolean) {
  enabled = next;
  if (enabled) provider.init();
}

export function trackPageview(path: string) {
  if (enabled) provider.pageview(path);
}

export function trackEvent(name: string, props?: Record<string, string | number | boolean>) {
  if (enabled) provider.event(name, props);
}
