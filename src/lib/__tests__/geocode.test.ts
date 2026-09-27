import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pickLabel, geocode } from '../geocode';

describe('pickLabel', () => {
  it('prefers city over broader fallbacks', () => {
    expect(pickLabel({ city: 'Amsterdam', county: 'Noord-Holland', state: 'Noord-Holland' })).toBe('Amsterdam');
  });

  it('falls through town, village, hamlet, suburb, county, state in order', () => {
    expect(pickLabel({ town: 'Alnwick', county: 'Northumberland' })).toBe('Alnwick');
    expect(pickLabel({ village: 'Grasmere' })).toBe('Grasmere');
    expect(pickLabel({ hamlet: 'Buttermere' })).toBe('Buttermere');
    expect(pickLabel({ suburb: 'Jordaan', state: 'Noord-Holland' })).toBe('Jordaan');
    expect(pickLabel({ county: 'Cumbria' })).toBe('Cumbria');
    expect(pickLabel({ state: 'Noord-Holland' })).toBe('Noord-Holland');
  });

  it('returns an empty string when no address or no usable field is present', () => {
    expect(pickLabel(undefined)).toBe('');
    expect(pickLabel({})).toBe('');
  });
});

describe('geocode', () => {
  // geocode() throttles every call through a shared 1.1s-minimum-interval
  // queue (Nominatim's usage policy caps clients at 1 req/sec) - fake timers
  // let these tests flush that wait instantly instead of each real test run
  // paying it.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function runGeocode(lat: number, lon: number): Promise<string> {
    const promise = geocode(lat, lon);
    await vi.runAllTimersAsync();
    return promise;
  }

  it('resolves to the picked label on a successful lookup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ address: { city: 'Amsterdam' } })
      })
    );
    await expect(runGeocode(52.37, 4.89)).resolves.toBe('Amsterdam');
  });

  it('resolves to an empty string rather than throwing on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(runGeocode(52.37, 4.89)).resolves.toBe('');
  });

  it('resolves to an empty string on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(runGeocode(52.37, 4.89)).resolves.toBe('');
  });
});
