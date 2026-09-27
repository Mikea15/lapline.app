// lib/weather.ts
// Weather condition lookup: resolves an activity's date/start-time/GPS
// start coordinate to a plain-language condition word (e.g. "Clear",
// "Rain") via Open-Meteo's free historical Archive API - no API key, no
// account. Temperature is already real (from the device's own sensor -
// see ActivityScreen's avgTemp); this only fills in the condition word
// next-steps.md flagged as missing. Only ever called when the user has
// opted in (settingsStore.getWeatherLookupEnabled) - see PrivacyPanel for
// the disclosure of exactly what this sends and to whom.

import { createThrottle } from './rate-limit';

interface ArchiveResponse {
  hourly?: {
    time: string[];
    weather_code: number[];
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

// Picks the hourly reading closest to the activity's own local start time
// (falling back to noon if no start time is known - e.g. an activity
// imported before startTimeLabel existed). Exported for testing.
export function pickHourIndex(times: string[], date: string, startTimeLabel: string): number {
  const hour = /^\d{2}:/.test(startTimeLabel) ? parseInt(startTimeLabel.slice(0, 2), 10) : 12;
  let best = -1;
  let bestDiff = Infinity;
  times.forEach((t, i) => {
    if (!t.startsWith(date)) return;
    const h = parseInt(t.slice(11, 13), 10);
    const diff = Math.abs(h - hour);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  return best;
}

// No documented hard rate limit for Open-Meteo's free tier, but each
// activity is only ever looked up once and cached, so a light spacing here
// is just good manners rather than a compliance requirement.
const throttled = createThrottle(400);

export async function lookupWeatherCondition(lat: number, lon: number, date: string, startTimeLabel: string): Promise<string> {
  return throttled(async () => {
    try {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&hourly=weather_code&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) return '';
      const data = (await res.json()) as ArchiveResponse;
      const times = data.hourly?.time ?? [];
      const codes = data.hourly?.weather_code ?? [];
      const idx = pickHourIndex(times, date, startTimeLabel);
      if (idx < 0 || idx >= codes.length) return '';
      return labelForWeatherCode(codes[idx]!);
    } catch {
      // Offline, blocked, or a date too recent for the archive to have
      // processed yet - fall back to no condition rather than surfacing a
      // network error on an otherwise-local screen.
      return '';
    }
  });
}
