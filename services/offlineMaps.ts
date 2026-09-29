// Offline map areas — warm the service worker's tile cache for a chosen
// map window so a drive with no signal still renders the basemap.
//
// The page computes the tile URL list (expanded from the live basemap
// style, so whatever providers MapCanvas uses today are covered), and the
// service worker fetches + caches them (see OCTANE_MAP_CACHE_TILE_URLS in
// public/sw.js). Tile requests for those hosts are then cache-first.

import { getOctaneStyle, DARK_RASTER_STYLE } from './mapStyle';

export interface MapArea {
  north: number;
  south: number;
  east: number;
  west: number;
}

// ~2 KB median vector tile; capping a warm-up at 3000 tiles stays inside the
// SW cache's 2000-entry LRU while covering a generous metro area at drive zooms.
const MAX_TILE_URLS = 3000;

interface TileURLTemplate {
  tiles: string[];
  minzoom?: number;
  maxzoom?: number;
}

const lngToWorldX = (lng: number, z: number) =>
  ((lng + 180) / 360) * Math.pow(2, z);
const latToWorldY = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  // Clamp near the poles — tile y explodes there.
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return y * Math.pow(2, z);
};

/** All z/x/y URLs of a template list inside the bbox. */
function expandTemplates(tpls: string[], area: MapArea, zooms: number[]): string[] {
  const urls: string[] = [];
  for (const tpl of tpls) {
    for (const z of zooms) {
      const x0 = Math.floor(lngToWorldX(area.west, z));
      const x1 = Math.floor(lngToWorldX(area.east, z));
      const y0 = Math.floor(latToWorldY(area.north, z));
      const y1 = Math.floor(latToWorldY(area.south, z));
      if (x1 - x0 + 1 <= 0 || y1 - y0 + 1 <= 0) continue;
      for (let x = x0; x <= x1; x++) {
        for (let y = Math.max(0, y0); y <= y1; y++) {
          urls.push(
            tpl
              .replace('{z}', String(z))
              .replace('{x}', String(((x % 2 ** z) + 2 ** z) % 2 ** z))
              .replace('{y}', String(y))
          );
        }
      }
    }
  }
  return urls;
}

/** Esri dark raster templates (the offline fallback basemap). */
const FALLBACK_TEMPLATES: TileURLTemplate[] = Object.values(
  (DARK_RASTER_STYLE as any).sources as Record<string, { tiles?: string[] }>
).map((s) => ({ tiles: s.tiles ?? [], maxzoom: 16 }));

async function collectBasemapTemplates(): Promise<TileURLTemplate[]> {
  const templates: TileURLTemplate[] = [];
  try {
    const style = await getOctaneStyle();
    for (const source of Object.values(style?.sources ?? {}) as any[]) {
      if (source?.type === 'raster' && Array.isArray(source.tiles)) {
        templates.push({ tiles: source.tiles, maxzoom: source.maxzoom });
      } else if (source?.type === 'vector' && typeof source.url === 'string') {
        // Vector sources point at a TileJSON; that carries the concrete tile URLs.
        const tileJson = await fetch(source.url).then((r) => (r.ok ? r.json() : null));
        if (tileJson?.tiles?.length) {
          templates.push({ tiles: tileJson.tiles, minzoom: tileJson.minzoom, maxzoom: tileJson.maxzoom });
        }
      }
    }
  } catch (e) {
    // getOctaneStyle already falls back to raster when the fetch fails.
    // eslint-disable-next-line no-console
    console.warn('[offline] could not read basemap style; using fallback tiles', e);
  }
  // Style fetch failed entirely? The raster fallback must still be cacheable.
  templates.push(...FALLBACK_TEMPLATES);
  return templates;
}

/**
 * Warm the offline tile cache for `area` down to zoom `maxZoom`
 * (16 = street level, matches the app's CruiseMode zoom).
 */
export async function cacheMapArea(
  area: MapArea,
  maxZoom = 16
): Promise<{ ok: number; failed: number }> {
  if (!('serviceWorker' in navigator)) return { ok: 0, failed: 0 };

  const templates = await collectBasemapTemplates();
  const zooms: number[] = [];
  for (let z = 0; z <= maxZoom; z++) zooms.push(z);

  // Area × zoom⁴ grows fast, so collect every candidate then cap hard.
  let urls = templates.flatMap((t) =>
    expandTemplates(t.tiles, area, zooms.slice(0, Math.min(maxZoom, t.maxzoom ?? maxZoom) + 1))
  );
  // Dedupe (fallback templates can overlap the fetched style's tiles).
  urls = [...new Set(urls)];
  if (urls.length > MAX_TILE_URLS) {
    // Highest-zoom tiles are the densest; dropping from the deep end keeps
    // the area renderable at lower zooms rather than half-covered at max.
    urls = urls
      .sort((a, b) => extractZoom(a) - extractZoom(b))
      .slice(0, MAX_TILE_URLS);
  }

  const reg = await navigator.serviceWorker.ready;
  if (!reg.active) return { ok: 0, failed: 0 };
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (ev) => {
      const data = ev.data ?? {};
      if (data.type === 'OCTANE_MAP_CACHE_RESULT') {
        resolve({ ok: data.ok ?? 0, failed: data.failed ?? 0 });
      }
    };
    reg.active!.postMessage(
      { type: 'OCTANE_MAP_CACHE_TILE_URLS', urls, id: Date.now() },
      [channel.port2]
    );
  });
}

const extractZoom = (url: string): number => {
  const m = /\/(\d+)\//.exec(url);
  return m ? Number(m[1]) : 0;
};