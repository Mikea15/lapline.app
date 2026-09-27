// scripts/demo/anonymise.ts - shared by make-demo-data.ts (the bundled
// sample sessions) and make-test-fixtures.ts (the unit tests' fixtures):
// turns real recordings into files that are safe to publish.
//
// FIT, per file:
// - Only the message types lib/fit-parser.ts actually reads are kept. That
//   drops device_info (serial numbers), user_profile (weight, age, name),
//   developer data and Garmin's undocumented messages.
// - file_id's serial number and product name are blanked.
// - Every known lat/long pair is rotated and moved by one transform shared
//   by a whole set of files, so routes keep their shape (and distances) and
//   their relationship to each other, but start from a public place in
//   another city.
// - Any other sint32 field whose value lies near the original start
//   (undocumented position fields) is cleared.
// GPX: every trkpt/wpt/rtept lat/lon goes through the same transform.
import { rewriteFit, type FitMessage } from '../../src/lib/fit-rewrite';

export interface LatLon {
  lat: number;
  lon: number;
}

// Vondelpark, Amsterdam - a public place, nowhere near the real recordings.
export const TARGET: LatLon = { lat: 52.358, lon: 4.8686 };
const ROTATE_DEG = 137;

const SEMI = 2 ** 31 / 180; // semicircles per degree
const NEAR_DEG = 1.5; // "near the original start" for catching undocumented positions

const KEEP = new Set([0, 12, 18, 19, 20, 21, 34, 49, 101, 140, 216]);
// Known [lat, long] field pairs per message.
const POSITION_PAIRS: Record<number, [number, number][]> = {
  20: [[0, 1]], // record.position
  19: [[3, 4], [5, 6]], // lap start/end
  18: [[3, 4], [38, 39]] // session start/end
};
const FILE_ID_BLANK = [3, 5, 8]; // serial_number, number, product_name

/** Rotates by ROTATE_DEG around `origin`, then moves `origin` onto TARGET, keeping local distances. */
export function makeMover(origin: LatLon): (p: LatLon) => LatLon {
  const rot = (ROTATE_DEG * Math.PI) / 180;
  const cosO = Math.cos((origin.lat * Math.PI) / 180);
  const cosT = Math.cos((TARGET.lat * Math.PI) / 180);
  return ({ lat, lon }) => {
    const dy = lat - origin.lat;
    const dx = (lon - origin.lon) * cosO;
    const ry = dx * Math.sin(rot) + dy * Math.cos(rot);
    const rx = dx * Math.cos(rot) - dy * Math.sin(rot);
    return { lat: TARGET.lat + ry, lon: TARGET.lon + rx / cosT };
  };
}

/** First record position in a FIT file, in degrees. */
export function firstFitPosition(bytes: Uint8Array): LatLon | null {
  let pos: LatLon | null = null;
  rewriteFit(bytes, {
    edit(msg) {
      if (pos || msg.global !== 20) return;
      const la = msg.get(0);
      const lo = msg.get(1);
      if (la !== null && lo !== null) pos = { lat: la / SEMI, lon: lo / SEMI };
    }
  });
  return pos;
}

function isSint32(msg: FitMessage, num: number): boolean {
  const f = msg.fields.find((x) => x.num === num);
  return !!f && (f.baseType & 0x1f) === 0x05 && f.size === 4;
}

/** Returns the anonymised file and how many stray position-like fields were cleared. */
export function anonymiseFit(bytes: Uint8Array, origin: LatLon): { bytes: Uint8Array<ArrayBuffer>; cleared: number } {
  const move = makeMover(origin);
  const nearOrigin = (semi: number) => Math.abs(semi / SEMI - origin.lat) < NEAR_DEG || Math.abs(semi / SEMI - origin.lon) < NEAR_DEG;
  let cleared = 0;
  const out = rewriteFit(bytes, {
    keep: (g) => KEEP.has(g),
    edit(msg) {
      if (msg.global === 0) for (const n of FILE_ID_BLANK) msg.clear(n);
      const handled = new Set<number>();
      for (const [la, lo] of POSITION_PAIRS[msg.global] ?? []) {
        handled.add(la).add(lo);
        const lat = msg.get(la);
        const lon = msg.get(lo);
        if (lat === null || lon === null) continue;
        const p = move({ lat: lat / SEMI, lon: lon / SEMI });
        msg.set(la, Math.round(p.lat * SEMI));
        msg.set(lo, Math.round(p.lon * SEMI));
      }
      for (const f of msg.fields) {
        if (handled.has(f.num) || !isSint32(msg, f.num)) continue;
        const v = msg.get(f.num);
        if (v !== null && Math.abs(v) > 1_000_000 && nearOrigin(v)) {
          msg.clear(f.num);
          cleared++;
        }
      }
    }
  });
  return { bytes: out, cleared };
}

/** First track point in a GPX file. */
export function firstGpxPosition(text: string): LatLon | null {
  const m = /<(?:trkpt|rtept|wpt)\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"/.exec(text);
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
}

export function anonymiseGpx(text: string, origin: LatLon): string {
  const move = makeMover(origin);
  return text.replace(/<(trkpt|rtept|wpt)(\s+)lat="([-\d.]+)"(\s+)lon="([-\d.]+)"/g, (_m, tag, s1, lat, s2, lon) => {
    const p = move({ lat: Number(lat), lon: Number(lon) });
    return `<${tag}${s1}lat="${p.lat.toFixed(7)}"${s2}lon="${p.lon.toFixed(7)}"`;
  });
}
