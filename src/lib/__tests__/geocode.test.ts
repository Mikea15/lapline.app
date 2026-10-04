import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pickLabel } from '../geocode';

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
  // paying it. A fresh module per test so one test's failure cooldown
  // doesn't leak into the next.
  let geocode: typeof import('../geocode').geocode;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    ({ geocode } = await import('../geocode'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function runGeocode(lat: number, lon: number): Promise<string | null> {
    const promise = geocode(lat, lon);
    await vi.runAllTimersAsync();
    return promise;
  }

  function okResponse(body: unknown) {
    return { ok: true, json: async () => body };
  }

  it('resolves to the picked label on a successful lookup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ address: { city: 'Amsterdam' } })));
    await expect(runGeocode(52.37, 4.89)).resolves.toBe('Amsterdam');
  });

  it("resolves to '' when the provider answers with no place name (a real, storable answer)", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ error: 'Unable to geocode' })));
    await expect(runGeocode(0, -30)).resolves.toBe('');
  });

  it('resolves to null rather than throwing on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(runGeocode(52.37, 4.89)).resolves.toBeNull();
  });

  it('resolves to null on a non-ok response (e.g. rate-limited)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(runGeocode(52.37, 4.89)).resolves.toBeNull();
  });

  it('does not re-query a failed coordinate until the cooldown has passed', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(runGeocode(52.37, 4.89)).resolves.toBeNull();
    await expect(runGeocode(52.37, 4.89)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(okResponse({ address: { city: 'Amsterdam' } }));
    vi.advanceTimersByTime(10 * 60_000);
    await expect(runGeocode(52.37, 4.89)).resolves.toBe('Amsterdam');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one request between concurrent lookups of the same coordinate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ address: { city: 'Amsterdam' } }));
    vi.stubGlobal('fetch', fetchMock);
    const both = Promise.all([geocode(52.37, 4.89), geocode(52.37, 4.89)]);
    await vi.runAllTimersAsync();
    await expect(both).resolves.toEqual(['Amsterdam', 'Amsterdam']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
