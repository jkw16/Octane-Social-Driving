// MapLibre basemap style — OpenFreeMap vector tiles with Esri raster fallback.
//
// OpenFreeMap provides free, no-key, CORS-open vector tiles hosted by Cloudflare.
// Vector tiles render crisp lines and labels at any zoom level/DPI and support
// dynamic theming (colors, typography, layers).
//
// If the vector style cannot be fetched (offline, network failure, or blocked),
// we gracefully fall back to Esri's dark gray raster canvas.

export const OPENFREEMAP_DARK_URL = 'https://tiles.openfreemap.org/styles/dark';

const ESRI_DARK_BASE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const ESRI_DARK_REF =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}';

export const DARK_RASTER_STYLE = {
  version: 8,
  sources: {
    'esri-dark-base': {
      type: 'raster',
      tiles: [ESRI_DARK_BASE],
      tileSize: 256,
      maxzoom: 16,
    },
    'esri-dark-ref': {
      type: 'raster',
      tiles: [ESRI_DARK_REF],
      tileSize: 256,
      maxzoom: 16,
    },
  },
  layers: [
    { id: 'dark-base', type: 'raster', source: 'esri-dark-base' },
    { id: 'dark-ref', type: 'raster', source: 'esri-dark-ref' },
  ],
};

/**
 * Takes OpenFreeMap style JSON and applies Octane brand overrides.
 * In Phase 2, this serves as the theme module pipeline.
 * In Phase 3, this injects Octane custom brand tokens (road classes, accent colors, typography).
 */
export function buildOctaneStyle(baseStyle: any): any {
  if (!baseStyle || typeof baseStyle !== 'object') {
    return DARK_RASTER_STYLE;
  }
  // Deep clone so mutations are isolated and don't affect cached source JSON
  const style = JSON.parse(JSON.stringify(baseStyle));
  return style;
}

let cachedOctaneStylePromise: Promise<any> | null = null;

/**
 * Loads the active Octane basemap style.
 * Fetches OpenFreeMap dark vector style at runtime and runs it through buildOctaneStyle().
 * If fetching fails or times out, falls back to DARK_RASTER_STYLE.
 * Results are cached in-memory for subsequent map mounts.
 */
export function getOctaneStyle(): Promise<any> {
  if (!cachedOctaneStylePromise) {
    cachedOctaneStylePromise = (async () => {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
        const res = await fetch(OPENFREEMAP_DARK_URL, {
          signal: controller?.signal,
        });
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const baseJson = await res.json();
        return buildOctaneStyle(baseJson);
      } catch (err) {
        console.warn('Failed to load OpenFreeMap vector style, falling back to dark raster style:', err);
        return DARK_RASTER_STYLE;
      }
    })();
  }
  return cachedOctaneStylePromise;
}

/**
 * Clears the in-memory cached style promise (useful for testing or network recovery).
 */
export function clearOctaneStyleCache(): void {
  cachedOctaneStylePromise = null;
}

// Pre-fetch in browser environment so the vector style is primed before user interaction
if (typeof window !== 'undefined') {
  void getOctaneStyle();
}