// lib/gpx-parser.ts
// GPX (GPS Exchange Format) parser - the format most non-Garmin exports
// use (Strava's own "Export GPX", and plenty of other watches/apps),
// unlike this app's only other import path (fit-parser.ts), which reads
// FIT. Implemented as plain string/regex extraction rather than pulling
// in a DOM/XML parser: real GPX exports are machine-generated with a
// small, consistent tag set, and this needs to behave identically in the
// browser (real import) and under Vitest's Node test environment (no
// DOMParser there) without adding a dependency just to bridge that gap.
//
// GPX's base spec carries only a real per-point lat/lon/elevation/time
// track - no HR/cadence/power field exists in it at all, unlike FIT.
// Some tools (chiefly Garmin) add those as a real per-point
// <gpxtpx:TrackPointExtension>; when present, this reads them by local
// tag name (ignoring whatever namespace prefix the exporting tool used),
// but this project's own real stub GPX files (Strava exports) carry none
// of that, so the hr/cad path here is untested against a real file.
// Everywhere a field genuinely isn't available, this leaves it at the
// same "no real reading" values (0 / [] / null) the rest of the app
// already uses, rather than guessing - same "don't fake data" convention
// fit-parser.ts already follows.

import type { ParsedActivity, RecordPoint, Lap } from './types';
import { sanitizeAltitudeSpikes, computeBestPace } from './fit-parser';

function extractAll(text: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1]!);
  return out;
}

// Matches a tag by its local name only, ignoring any namespace prefix
// (<gpxtpx:hr>, <ns2:hr>, and plain <hr> all match "hr") - GPX extension
// elements are always namespaced, but real-world exporters don't agree
// on which prefix they use.
function extractLocal(text: string, localName: string): string | null {
  const re = new RegExp(`<(?:[\\w.-]+:)?${localName}(?:\\s[^>]*)?>([^<]*)<\\/(?:[\\w.-]+:)?${localName}>`);
  return re.exec(text)?.[1]?.trim() ?? null;
}

function numLocal(text: string, localName: string): number | null {
  const raw = extractLocal(text, localName);
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function getDateString(t: Date): string {
  return t.toISOString().split('T')[0] ?? '0001-01-01';
}

// Display-only wall-clock start time, same "local time, not UTC" contract
// fit-parser.ts's own getStartTimeLabel() uses.
function getStartTimeLabel(t: Date): string {
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

const EARTH_RADIUS_M = 6371000;
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

interface RawPoint {
  lat: number;
  lon: number;
  ele: number | null;
  time: Date | null;
  hr: number;
  cadence: number;
  temp: number;
}

function parseTrkpt(block: string, attrs: string): RawPoint | null {
  const latMatch = /lat="([^"]+)"/.exec(attrs);
  const lonMatch = /lon="([^"]+)"/.exec(attrs);
  if (!latMatch || !lonMatch) return null;
  const lat = Number(latMatch[1]);
  const lon = Number(lonMatch[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const timeStr = extractLocal(block, 'time');
  const time = timeStr ? new Date(timeStr) : null;

  return {
    lat,
    lon,
    ele: numLocal(block, 'ele'),
    time: time && !Number.isNaN(time.getTime()) ? time : null,
    hr: numLocal(block, 'hr') ?? 0,
    cadence: numLocal(block, 'cad') ?? 0,
    temp: numLocal(block, 'atemp') ?? 0
  };
}

function buildLap(records: RecordPoint[], startIdx: number, endIdx: number, index: number): Lap {
  const startRec = records[startIdx]!;
  const endRec = records[endIdx]!;
  const elapsedSec = endRec.t - startRec.t;
  const distanceM = endRec.distance - startRec.distance;
  const slice = records.slice(startIdx, endIdx + 1);
  const hrSamples = slice.map((r) => r.hr).filter((v) => v > 0);
  const cadenceSamples = slice.map((r) => r.cadence).filter((v) => v > 0);
  return {
    index,
    startOffsetSec: startRec.t,
    elapsedSec,
    distanceM,
    avgPaceMinPerKm: distanceM > 0 ? elapsedSec / (distanceM / 1000) / 60 : 0,
    avgHR: hrSamples.length ? Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length) : 0,
    maxHR: hrSamples.length ? Math.max(...hrSamples) : 0,
    avgCadence: cadenceSamples.length ? Math.round(cadenceSamples.reduce((a, b) => a + b, 0) / cadenceSamples.length) : 0
  };
}

export function parseGPX(xmlText: string): ParsedActivity[] {
  const out: ParsedActivity[] = [];

  for (const trkBlock of extractAll(xmlText, 'trk')) {
    const sport = extractLocal(trkBlock, 'type')?.trim() || 'Unknown';

    const rawPoints: RawPoint[] = [];
    // trkpt attributes (lat/lon) live on the opening tag itself, not
    // inside it, so this needs both the tag's own attribute string and
    // its inner content (ele/time/extensions) - extractAll() only gives
    // the latter, so trkpt is matched directly here instead.
    const trkptRe = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g;
    let m: RegExpExecArray | null;
    while ((m = trkptRe.exec(trkBlock))) {
      const p = parseTrkpt(m[2]!, m[1]!);
      if (p) rawPoints.push(p);
    }

    // A track needs its own real timestamps to place points on a
    // timeline at all - one with none (or only one usable point) can't
    // become a real activity.
    const timed = rawPoints.filter((p): p is RawPoint & { time: Date } => p.time !== null);
    if (timed.length < 2) continue;

    const startMs = timed[0]!.time.getTime();
    const records: RecordPoint[] = [];
    let cumulativeDistanceM = 0;

    for (let i = 0; i < timed.length; i++) {
      const p = timed[i]!;
      const prev = i > 0 ? timed[i - 1]! : null;
      let speedKmh = 0;
      if (prev) {
        const dtSec = (p.time.getTime() - prev.time.getTime()) / 1000;
        const dM = haversineM(prev.lat, prev.lon, p.lat, p.lon);
        cumulativeDistanceM += dM;
        if (dtSec > 0) speedKmh = (dM / dtSec) * 3.6;
      }
      records.push({
        t: Math.floor((p.time.getTime() - startMs) / 1000),
        hr: Math.round(p.hr),
        cadence: Math.round(p.cadence),
        power: 0,
        distance: cumulativeDistanceM,
        temp: Math.round(p.temp),
        altitude: p.ele ?? 0,
        speed: speedKmh,
        perfCondition: null,
        lat: p.lat,
        lon: p.lon
      });
    }

    const totalDistanceM = records[records.length - 1]!.distance;
    const elapsedSec = records[records.length - 1]!.t;
    if (elapsedSec <= 0 || totalDistanceM <= 0) continue;

    const cleanAltitude = sanitizeAltitudeSpikes(records);
    records.forEach((r, i) => (r.altitude = cleanAltitude[i]!));

    let ascentM = 0;
    let descentM = 0;
    for (let i = 1; i < records.length; i++) {
      const delta = records[i]!.altitude - records[i - 1]!.altitude;
      if (delta > 0) ascentM += delta;
      else descentM += -delta;
    }

    // Real 1km auto-laps computed from this same cumulative-distance
    // stream - GPX carries no lap/split messages of its own the way FIT
    // does, so this is the closest honest equivalent (a device's own
    // "auto lap every 1km" does the same computation on-device, just
    // from its own GPS stream instead of this file's one). A final
    // partial lap under 500m is kept for display but, same as FIT's own
    // laps, excluded from bestPace below via computeBestPace's own rule.
    const laps: Lap[] = [];
    let lapStartIdx = 0;
    let nextThresholdM = 1000;
    for (let i = 1; i < records.length; i++) {
      if (records[i]!.distance >= nextThresholdM) {
        laps.push(buildLap(records, lapStartIdx, i, laps.length));
        lapStartIdx = i;
        nextThresholdM += 1000;
      }
    }
    if (lapStartIdx < records.length - 1) {
      laps.push(buildLap(records, lapStartIdx, records.length - 1, laps.length));
    }

    const hrSamples = records.map((r) => r.hr).filter((v) => v > 0);
    const cadenceSamples = records.map((r) => r.cadence).filter((v) => v > 0);
    const maxSpeedKmh = records.reduce((max, r) => Math.max(max, r.speed), 0);

    out.push({
      activity: {
        id: 0,
        date: getDateString(timed[0]!.time),
        sport,
        // GPX's own timestamps are the only real timing signal this
        // format carries - unlike FIT's device-reported total_timer_time,
        // there's no real way to tell "genuinely paused" from "just
        // moving slowly" from them alone, so durationMin/elapsedDurationMin
        // are deliberately the same real number (the track's own total
        // wall-clock span) rather than guessing at a split between them.
        durationMin: elapsedSec / 60,
        elapsedDurationMin: elapsedSec / 60,
        distanceKm: totalDistanceM / 1000,
        avgHR: hrSamples.length ? Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length) : 0,
        maxHR: hrSamples.length ? Math.max(...hrSamples) : 0,
        calories: 0,
        avgCadence: cadenceSamples.length ? Math.round(cadenceSamples.reduce((a, b) => a + b, 0) / cadenceSamples.length) : 0,
        maxCadence: cadenceSamples.length ? Math.max(...cadenceSamples) : 0,
        ascentM: Math.round(ascentM),
        descentM: Math.round(descentM),
        avgSpeedKmh: totalDistanceM / 1000 / (elapsedSec / 3600),
        maxSpeedKmh,
        bestPaceMinPerKm: computeBestPace(laps),
        avgStrideLengthM: 0,
        timeInZoneSec: [],
        hrZoneBoundaries: [],
        aerobicTrainingEffect: 0,
        anaerobicTrainingEffect: 0,
        workoutFeel: null,
        workoutRpe: null,
        sweatLossMl: 0,
        recoveryHrBpm: 0,
        garminVo2Max: 0,
        recoveryTimeHours: 0,
        startTimeLabel: getStartTimeLabel(timed[0]!.time),
        startUtc: timed[0]!.time.toISOString(),
        poolLengthM: 0
      },
      records,
      laps,
      lengths: []
    });
  }

  return out;
}
