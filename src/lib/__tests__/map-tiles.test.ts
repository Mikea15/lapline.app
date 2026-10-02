import { describe, it, expect, vi } from 'vitest';
import { mercator, routeFrame, projectFlatRoute } from '../flat-route';

vi.stubEnv('VITE_MAP_TILES_KEY', 'test-key');
const { tilesFor } = await import('../map-tiles');

const ROUTE = [
  { lat: 52.35, lon: 4.86 },
  { lat: 52.36, lon: 4.9 },
  { lat: 52.34, lon: 4.89 }
];

describe('mercator', () => {
  it('maps the equator and prime meridian to the middle of the world', () => {
    const p = mercator(0, 0);
    expect(p.x).toBeCloseTo(128, 6);
    expect(p.y).toBeCloseTo(128, 6);
  });

  it('puts the north higher on screen (smaller y)', () => {
    expect(mercator(60, 0).y).toBeLessThan(mercator(10, 0).y);
  });
});

describe('routeFrame', () => {
  it('is the linear map projectFlatRoute uses', () => {
    const frame = routeFrame(ROUTE)!;
    const points = projectFlatRoute(ROUTE)!;
    ROUTE.forEach((f, i) => {
      const w = mercator(f.lat, f.lon);
      expect(w.x * frame.scale + frame.offsetX).toBeCloseTo(points[i]!.x, 6);
      expect(w.y * frame.scale + frame.offsetY).toBeCloseTo(points[i]!.y, 6);
    });
  });
});

describe('tilesFor', () => {
  const frame = routeFrame(ROUTE)!;
  const view = { x: 0, y: 0, w: 1000, h: 1000 };

  it('covers the whole view with whole tiles at one zoom', () => {
    const tiles = tilesFor(frame, view, 0.5, 'dark');
    expect(tiles.length).toBeGreaterThan(0);
    const zooms = new Set(tiles.map((t) => t.key.split('/')[0]));
    expect(zooms.size).toBe(1);
    const minX = Math.min(...tiles.map((t) => t.x));
    const minY = Math.min(...tiles.map((t) => t.y));
    const maxX = Math.max(...tiles.map((t) => t.x + t.size));
    const maxY = Math.max(...tiles.map((t) => t.y + t.size));
    expect(minX).toBeLessThanOrEqual(view.x);
    expect(minY).toBeLessThanOrEqual(view.y);
    expect(maxX).toBeGreaterThanOrEqual(view.x + view.w);
    expect(maxY).toBeGreaterThanOrEqual(view.y + view.h);
  });

  it('picks a higher zoom for a bigger panel', () => {
    const zoom = (px: number) => Number(tilesFor(frame, view, px, 'dark')[0]!.key.split('/')[0]);
    expect(zoom(1)).toBe(zoom(0.5) + 1);
  });

  it('uses the theme style and sends the key', () => {
    expect(tilesFor(frame, view, 0.5, 'dark')[0]!.href).toMatch(/\/dark_nolabels\/.*\?key=test-key$/);
    expect(tilesFor(frame, view, 0.5, 'light')[0]!.href).toMatch(/\/light_nolabels\//);
  });

  it('refuses a request that would need too many tiles', () => {
    expect(tilesFor(frame, { x: -5000, y: -5000, w: 11000, h: 11000 }, 0.5, 'dark')).toEqual([]);
  });
});
