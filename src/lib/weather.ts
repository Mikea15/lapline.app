// lib/weather.ts
// Weather condition lookup: resolves an activity's date/start-time/GPS
// start coordinate to a plain-language condition word (e.g. "Clear",
// "Rain") via Open-Meteo's free historical Archive API - no API key, no
// account. Temperature is already real (from the device's own sensor -
// see ActivityScreen's avgTemp); this only fills in the condition word
// next-steps.md flagged as missing. Only ever called when the user has
// opted in (settingsStore.getWeatherLookupEnabled) - see PrivacyPanel for
// the disclosure of exactly what this sends and to whom.

import { activityStart } from './activity-time';
import { createRetryGate, createThrottle } from './rate-limit';

interface ArchiveResponse {
  hourly?: {
    time: string[];
    // null for hours the archive hasn't processed yet (it lags real time
    // by several days).
    weather_code: (number | null)[];
  };
}

// WMO weather interpretation codes, as used by Open-Meteo and most other
// weather services - https://open-meteo.com/en/docs/historical-weather-api.
// Exported for testing.
export const WMO_LABELS: Record<number, string> = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy rain showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with hail'
};

export function labelForWeatherCode(code: number): string {
  return WMO_LABELS[code] ?? '';
}

// The activity's real start instant: the stored startUtc, or for an
// activity imported before that field existed, rebuilt from `date` +
// startTimeLabel (see activityStart). Falls back to noon UTC on `date` when
// there's neither. Exported for testing.
export function startInstant(date: string, startTimeLabel: string, startUtc?: string): Date {
  return activityStart({ date, startTimeLabel, startUtc }) ?? new Date(`${date}T12:00:00Z`);
}

// Index of the hourly reading (timestamps in UTC, "YYYY-MM-DDTHH:MM") for
// the hour the activity started in, or -1 if the response doesn't have it.
// Exported for testing.
export function pickHourIndex(times: string[], start: Date): number {
  const hour = start.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
  return times.findIndex((t) => t.startsWith(hour));
}

// No documented hard rate limit for Open-Meteo's free tier, but each
// activity is only ever looked up once and cached, so a light spacing here
// is just good manners rather than a compliance requirement.
const throttled = createThrottle(400);
// A request that just failed (or found no data yet) isn't retried for a
// few minutes.
const gated = createRetryGate<string>(10 * 60_000);

// Resolves to the condition word ('' for a weather code this app has no
// word for - a real answer, safe to store), or null when there's no answer
// yet: offline, blocked, a server error, or an hour the archive hasn't
// filled in yet. null must not be stored, so a later visit tries again.
//
// Asks for the start's UTC day in GMT and picks the UTC start hour, so the
// day and hour asked for are always the ones the activity happened in -
// unlike asking for `date` in the location's own timezone, which is a
// different day whenever local and UTC dates differ (an evening run in the
// Americas, a just-after-midnight run east of Greenwich). Pass the
// activity's startUtc when it has one: without it the start hour is rebuilt
// from the label in this browser's current timezone, which is wrong if the
// file was imported in another one.
export async function lookupWeatherCondition(
  lat: number,
  lon: number,
  date: string,
  startTimeLabel: string,
  startUtc?: string
): Promise<string | null> {
  const start = startInstant(date, startTimeLabel, startUtc);
  const day = start.toISOString().slice(0, 10);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${day}&end_date=${day}&hourly=weather_code&timezone=GMT`;
  return gated(`${url}|${start.toISOString().slice(0, 13)}`, () =>
    throttled(async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = (await res.json()) as ArchiveResponse;
        const times = data.hourly?.time ?? [];
        const codes = data.hourly?.weather_code ?? [];
        const idx = pickHourIndex(times, start);
        const code = idx < 0 ? null : codes[idx];
        if (code === null || code === undefined) return null;
        return labelForWeatherCode(code);
      } catch {
        // Offline, blocked, or a malformed response - no condition for now,
        // rather than surfacing a network error on an otherwise-local screen.
        return null;
      }
    })
  );
}
