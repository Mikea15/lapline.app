// lib/geocode.ts
// Reverse geocoding: turns a route's start GPS coordinate into a short
// place name (e.g. "City of Amsterdam"), via OpenStreetMap's Nominatim -
// free, no API key, but its usage policy caps clients at one request per
// second and asks for an identifying request - both handled here so every
// call site (ActivityScreen) can just await geocode(lat, lon) without
// worrying about either. Only ever called when the user has opted in
// (settingsStore.getLocationLookupEnabled) - see PrivacyPanel for the
// disclosure of exactly what this sends and to whom.

import { createThrottle } from './rate-limit';

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  suburb?: string;
  county?: string;
  state?: string;
}

interface NominatimResponse {
  address?: NominatimAddress;
  display_name?: string;
}

// Nominatim's usage policy caps clients at one request per second.
const throttled = createThrottle(1100);

// Picks the shortest sensible locality name from Nominatim's address
// breakdown - city/town/village/hamlet before the broader suburb/county/
// state fallbacks, matching how a device's own on-device place name
// (e.g. Garmin's "City of Amsterdam") tends to read. Exported for testing.
export function pickLabel(address: NominatimAddress | undefined): string {
  if (!address) return '';
  return address.city || address.town || address.village || address.hamlet || address.suburb || address.county || address.state || '';
}

export async function geocode(lat: number, lon: number): Promise<string> {
  return throttled(async () => {
    try {
      // Nominatim's usage policy asks for a valid HTTP Referer or a custom
      // User-Agent identifying the app; browsers block scripts from setting
      // User-Agent, but fetch() already sends this page's own Referer by
      // default, which satisfies the policy without any extra header here.
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return '';
      const data = (await res.json()) as NominatimResponse;
      return pickLabel(data.address);
    } catch {
      // Offline, blocked, or rate-limited - fall back to no label rather
      // than surfacing a network error on an otherwise-local screen.
      return '';
    }
  });
}
