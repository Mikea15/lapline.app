// lib/map-tiles.ts - the optional map background under the Activity
// screen's Plan route (PlanRouteMap.svelte): which raster tiles cover the
// visible area, at the zoom that matches the panel's real pixels. Tiles are
// CARTO's basemaps (OpenStreetMap data), dark or light to match the theme.
// Off unless the user turns on Settings > Map backgrounds, because loading
// tiles tells CARTO which area the activity was in.
import type { RouteFrame } from './flat-route';
import type { Theme } from './theme';

export const MAP_ATTRIBUTION = [
  { label: 'OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' },
  { label: 'CARTO', href: 'https://carto.com/attributions' }
];

// The label-free styles: place and street names would sit under the route
// line and compete with it.
const STYLE: Record<Theme, string> = { dark: 'dark_nolabels', light: 'light_nolabels' };

/** CARTO's free non-commercial key (VITE_MAP_TILES_KEY in .env, requested
 *  at carto.com/basemaps/apikey). Without one there are no map backgrounds,
 *  and Settings hides the option. It ships in the page by design: tile keys
 *  are public, and limited by usage rather than secrecy. */
export const MAP_TILES_KEY: string = import.meta.env.VITE_MAP_TILES_KEY ?? '';
export const mapTilesAvailable = MAP_TILES_KEY !== '';
const MAX_ZOOM = 19;
// A runaway (e.g. a broken layout reporting a huge panel) shouldn't fire
// hundreds of requests.
const MAX_TILES = 48;

export interface Tile {
  key: string;
  href: string;
  /** Position and size in the route's viewBox units. */
  x: number;
  y: number;
  size: number;
}

/**
 * Tiles covering a viewBox-space rectangle.
 * @param view the visible area in viewBox units
 * @param pxPerUnit screen pixels per viewBox unit
 */
export function tilesFor(frame: RouteFrame, view: { x: number; y: number; w: number; h: number }, pxPerUnit: number, theme: Theme): Tile[] {
  // At zoom z one zoom-0 world unit is 2^z tile pixels; pick the zoom where
  // that matches screen pixels (the @2x images keep it sharp on retina).
  const pxPerWorld = pxPerUnit * frame.scale;
  const z = Math.max(0, Math.min(MAX_ZOOM, Math.round(Math.log2(pxPerWorld))));
  const n = 2 ** z;
  const tileWorld = 256 / n;
  const toWorldX = (vx: number) => (vx - frame.offsetX) / frame.scale;
  const toWorldY = (vy: number) => (vy - frame.offsetY) / frame.scale;
  const x0 = Math.max(0, Math.floor(toWorldX(view.x) / tileWorld));
  const x1 = Math.min(n - 1, Math.floor(toWorldX(view.x + view.w) / tileWorld));
  const y0 = Math.max(0, Math.floor(toWorldY(view.y) / tileWorld));
  const y1 = Math.min(n - 1, Math.floor(toWorldY(view.y + view.h) / tileWorld));
  if (!mapTilesAvailable || (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES) return [];

  const tiles: Tile[] = [];
  const size = tileWorld * frame.scale;
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      const sub = 'abcd'[(tx + ty) % 4];
      tiles.push({
        key: `${z}/${tx}/${ty}`,
        href: `https://${sub}.basemaps.cartocdn.com/${STYLE[theme]}/${z}/${tx}/${ty}@2x.png?key=${encodeURIComponent(MAP_TILES_KEY)}`,
        x: tx * tileWorld * frame.scale + frame.offsetX,
        y: ty * tileWorld * frame.scale + frame.offsetY,
        size
      });
    }
  }
  return tiles;
}
