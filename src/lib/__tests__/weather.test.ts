import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { labelForWeatherCode, pickHourIndex, lookupWeatherCondition } from '../weather';

describe('labelForWeatherCode', () => {
  it('maps known WMO codes to their plain-language label', () => {
    expect(labelForWeatherCode(0)).toBe('Clear');
    expect(labelForWeatherCode(63)).toBe('Rain');
    expect(labelForWeatherCode(95)).toBe('Thunderstorm');
  });

  it('returns an empty string for an unknown code', () => {
    expect(labelForWeatherCode(999)).toBe('');
  });
});

describe('pickHourIndex', () => {
  const times = ['2026-06-01T00:00', '2026-06-01T08:00', '2026-06-01T09:00', '2026-06-02T09:00'];

  it('picks the same-date hour closest to the activity start time', () => {
    expect(pickHourIndex(times, '2026-06-01', '08:47')).toBe(1);
    expect(pickHourIndex(times, '2026-06-01', '09:03')).toBe(2);
  });

  it('falls back to noon when no start time label is known', () => {
    // Closest of 00:00, 08:00, 09:00 to noon (12:00) is 09:00.
    expect(pickHourIndex(times, '2026-06-01', '')).toBe(2);
  });

  it('returns -1 when no hour matches the given date', () => {
    expect(pickHourIndex(times, '2026-06-03', '08:00')).toBe(-1);
  });
});

describe('lookupWeatherCondition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function run(lat: number, lon: number, date: string, startTimeLabel: string): Promise<string> {
    const promise = lookupWeatherCondition(lat, lon, date, startTimeLabel);
    await vi.runAllTimersAsync();
    return promise;
  }

  it('resolves to the condition label for the closest hourly reading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hourly: { time: ['2026-06-01T08:00'], weather_code: [61] }
        })
      })
    );
    await expect(run(52.37, 4.89, '2026-06-01', '08:03')).resolves.toBe('Light rain');
  });

  it('resolves to an empty string rather than throwing on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(run(52.37, 4.89, '2026-06-01', '08:03')).resolves.toBe('');
  });

  it('resolves to an empty string on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(run(52.37, 4.89, '2026-06-01', '08:03')).resolves.toBe('');
  });

  it('resolves to an empty string when no hourly reading matches the date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hourly: { time: [], weather_code: [] } })
      })
    );
    await expect(run(52.37, 4.89, '2026-06-01', '08:03')).resolves.toBe('');
  });
});
