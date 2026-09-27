import { describe, it, expect } from 'vitest';
import { installHint } from '../install-hint';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.46 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  macEdge: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0'
};

const env = (userAgent: string, extra: { standalone?: boolean; maxTouchPoints?: number } = {}) => ({
  userAgent,
  standalone: extra.standalone ?? false,
  maxTouchPoints: extra.maxTouchPoints ?? 0
});

describe('installHint', () => {
  it('asks Safari on iPhone to add to the Home Screen', () => {
    expect(installHint(env(UA.iphoneSafari, { maxTouchPoints: 5 }))).toBe('ios');
  });
  it('treats iPadOS Safari (which reports a Mac user agent) as iOS', () => {
    expect(installHint(env(UA.macSafari, { maxTouchPoints: 5 }))).toBe('ios');
  });
  it('asks Safari on a Mac to add to the Dock', () => {
    expect(installHint(env(UA.macSafari))).toBe('mac');
  });
  it('says nothing once installed', () => {
    expect(installHint(env(UA.iphoneSafari, { standalone: true }))).toBeNull();
    expect(installHint(env(UA.macSafari, { standalone: true }))).toBeNull();
  });
  it('says nothing in other browsers', () => {
    for (const ua of [UA.iphoneChrome, UA.iphoneFirefox, UA.macChrome, UA.macEdge, UA.androidChrome, UA.windowsFirefox]) {
      expect(installHint(env(ua))).toBeNull();
    }
  });
});
