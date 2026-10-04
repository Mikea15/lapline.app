import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { labelForWeatherCode, pickHourIndex, startInstant } from '../weather';

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

// startInstant() reads the browser's timezone (the one startTimeLabel was
// written in), so these tests pin it. Node re-reads process.env.TZ on
// assignment.
const originalTZ = process.env.TZ;
function useTimezone(tz: string) {
  process.env.TZ = tz;
}
function restoreTimezone() {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
}

describe('startInstant', () => {
  afterEach(restoreTimezone);

  it('rebuilds a New York evening start that is already the next day in UTC', () => {
    // 19:00 EST on 15 Jan = 00:00 UTC on 16 Jan, so the parser stored date 2026-01-16.
    useTimezone('America/New_York');
    expect(startInstant('2026-01-16', '19:00').toISOString()).toBe('2026-01-16T00:00:00.000Z');
  });

  it('rebuilds a Berlin just-after-midnight start that is still the previous day in UTC', () => {
    // 00:30 CEST on 2 Jun = 22:30 UTC on 1 Jun, so the parser stored date 2026-06-01.
    useTimezone('Europe/Berlin');
    expect(startInstant('2026-06-01', '00:30').toISOString()).toBe('2026-06-01T22:30:00.000Z');
  });

  it('round-trips what the parsers store, whatever the timezone', () => {
    const instant = new Date('2026-03-29T01:15:00Z'); // also a European DST changeover night
    for (const tz of ['UTC', 'America/Los_Angeles', 'Europe/Berlin', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      useTimezone(tz);
      const date = instant.toISOString().slice(0, 10);
      const label = `${String(instant.getHours()).padStart(2, '0')}:${String(instant.getMinutes()).padStart(2, '0')}`;
      expect(startInstant(date, label).toISOString(), tz).toBe(instant.toISOString());
    }
  });

  it('uses the stored startUtc over the label, whatever the browser timezone is now', () => {
    // Imported in New York (19:00 EST = 00:00 UTC next day), viewed in Tokyo:
    // the label alone would rebuild 19:00 JST = 10:00 UTC.
    useTimezone('Asia/Tokyo');
    expect(startInstant('2026-01-16', '19:00').toISOString()).toBe('2026-01-16T10:00:00.000Z');
    expect(startInstant('2026-01-16', '19:00', '2026-01-16T00:00:00.000Z').toISOString()).toBe('2026-01-16T00:00:00.000Z');
  });

  it('falls back to the label when startUtc is unparseable', () => {
    useTimezone('UTC');
    expect(startInstant('2026-06-01', '08:03', 'garbage').toISOString()).toBe('2026-06-01T08:03:00.000Z');
  });

  it('falls back to noon UTC on the date when there is no usable start time', () => {
    expect(startInstant('2026-06-01', '').toISOString()).toBe('2026-06-01T12:00:00.000Z');
  });
});

describe('pickHourIndex', () => {
  const times = ['2026-06-01T00:00', '2026-06-01T08:00', '2026-06-01T09:00', '2026-06-02T09:00'];

  it('picks the UTC hour the activity started in', () => {
    expect(pickHourIndex(times, new Date('2026-06-01T08:47:00Z'))).toBe(1);
    expect(pickHourIndex(times, new Date('2026-06-01T09:03:00Z'))).toBe(2);
    expect(pickHourIndex(times, new Date('2026-06-02T09:59:00Z'))).toBe(3);
  });

  it('returns -1 when the response has no reading for that hour', () => {
    expect(pickHourIndex(times, new Date('2026-06-01T10:00:00Z'))).toBe(-1);
  });
});

describe('lookupWeatherCondition', () => {
  // Fresh module per test so one test's failure cooldown doesn't leak into
  // the next. UTC by default so a start label reads as its own UTC hour.
  let lookupWeatherCondition: typeof import('../weather').lookupWeatherCondition;

  beforeEach(async () => {
    useTimezone('UTC');
    vi.useFakeTimers();
    vi.resetModules();
    ({ lookupWeatherCondition } = await import('../weather'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    restoreTimezone();
  });

  // A GMT day of hourly readings: hour h gets code codeFor(h).
  function gmtDay(day: string, codeFor: (h: number) => number) {
    const hours = Array.from({ length: 24 }, (_, h) => h);
    return {
      ok: true,
      json: async () => ({
        hourly: {
          time: hours.map((h) => `${day}T${String(h).padStart(2, '0')}:00`),
          weather_code: hours.map(codeFor)
        }
      })
    };
  }

  it('asks for the right UTC day and hour for a New York evening run', async () => {
    useTimezone('America/New_York');
    const fetchMock = vi.fn().mockResolvedValue(gmtDay('2026-01-16', (h) => (h === 0 ? 71 : 0)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(run(40.78, -73.97, '2026-01-16', '19:00')).resolves.toBe('Light snow');
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('start_date=2026-01-16&end_date=2026-01-16');
    expect(url).toContain('timezone=GMT');
  });

  it('asks for the right UTC day and hour for a Berlin just-after-midnight run', async () => {
    useTimezone('Europe/Berlin');
    const fetchMock = vi.fn().mockResolvedValue(gmtDay('2026-06-01', (h) => (h === 22 ? 95 : 0)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(run(52.52, 13.4, '2026-06-01', '00:30')).resolves.toBe('Thunderstorm');
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('start_date=2026-06-01&end_date=2026-06-01');
    expect(url).toContain('timezone=GMT');
  });

  it('asks for the start hour from startUtc when the browser has since changed timezone', async () => {
    // New York evening run (00:00 UTC), imported there, looked up from Tokyo.
    useTimezone('Asia/Tokyo');
    const fetchMock = vi.fn().mockResolvedValue(gmtDay('2026-01-16', (h) => (h === 0 ? 71 : 0)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(run(40.78, -73.97, '2026-01-16', '19:00', '2026-01-16T00:00:00.000Z')).resolves.toBe('Light snow');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('start_date=2026-01-16&end_date=2026-01-16');
  });

  async function run(lat: number, lon: number, date: string, startTimeLabel: string, startUtc?: string): Promise<string | null> {
    const promise = lookupWeatherCondition(lat, lon, date, startTimeLabel, startUtc);
    await vi.runAllTimersAsync();
    return promise;
  }

  function okResponse(body: unknown) {
    return { ok: true, json: async () => body };
  }

  it('resolves to the condition label for the closest hourly reading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse({ hourly: { time: ['2026-06-01T08:00'], weather_code: [61] } }))
    );
    await expect(run(52.37, 4.89, '2026-06-01', '08:03')).resolves.toBe('Light rain');
  });

  it("resolves to '' for a code with no label (a real, storable answer)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse({ hourly: { time: ['2026-06-01T08:00'], weather_code: [999] } }))
    );
    await expect(run(52.37, 4.89, '2026-06-01', '08:03')).resolves.toBe('');
  });

  it('resolves to null rather than throwing on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(run(52.37, 4.89, '2026-06-01', '08:03')).resolves.toBeNull();
  });

  it('resolves to null on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(run(52.37, 4.89, '2026-06-01', '08:03')).resolves.toBeNull();
  });

  it("resolves to null when the archive hasn't filled in that day yet (all-null codes)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse({ hourly: { time: ['2026-06-01T07:00', '2026-06-01T08:00'], weather_code: [null, null] } })
      )
    );
    await expect(run(52.37, 4.89, '2026-06-01', '08:03')).resolves.toBeNull();
  });

  it('resolves to null when no hourly reading matches the date', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ hourly: { time: [], weather_code: [] } })));
    await expect(run(52.37, 4.89, '2026-06-01', '08:03')).resolves.toBeNull();
  });

  it('does not re-query a failed lookup until the cooldown has passed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    await expect(run(52.37, 4.89, '2026-06-01', '08:03')).resolves.toBeNull();
    await expect(run(52.37, 4.89, '2026-06-01', '08:03')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(okResponse({ hourly: { time: ['2026-06-01T08:00'], weather_code: [0] } }));
    vi.advanceTimersByTime(10 * 60_000);
    await expect(run(52.37, 4.89, '2026-06-01', '08:03')).resolves.toBe('Clear');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
