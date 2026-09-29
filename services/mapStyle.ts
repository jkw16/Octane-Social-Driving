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
 * Octane brand tokens — mirrored from tailwind.config.js so the basemap and
 * the UI read as one system. Change here is not automatic; keep in sync.
 */
export const OCTANE_COLORS = {
  black: '#0f172a',
  dark: '#1e293b',
  accent: '#06b6d4',     // Cyan 500 — accent roads, POI highlights
  accentDim: '#155e75',  // Cyan 800 — secondary roads read through the accent
  success: '#22c55e',
  danger: '#ef4444',
  land: '#0b1220',        // base canvas, slightly deeper than octane-black
  water: '#0e2a44',       // blue-slate water that still reads against land
  green: '#0f1c2e',       // parks / green areas, barely brighter than land
  roadMinor: '#334155',   // slate-700, dimmed minor roads
  roadMajor: '#475569',
  label: '#cbd5e1',       // label text
  labelHalo: '#0f172a',
} as const;

/**
 * Takes OpenFreeMap style JSON and applies Octane brand overrides.
 *
 * OpenFreeMap's dark style follows the openmaptiles schema: its layers have
 * `source-layer: 'water'|'transportation'|'park'|...` and ids like
 * 'water-*', 'road_*'/'road-*', 'building-*', '*-label'. We restyle by
 * predicate rather than by id so it degrades gracefully if OpenFreeMap
 * renames or reorders layers.
 *
 * Label FONT families are intentionally NOT changed: the style's glyphs URL
 * only serves the fonts the style declares, so pointing text at the app's
 * display font would 404 glyph ranges and blank out labels. We restyle
 * label color/halo instead — same visual intent without breaking tiles.
 */
export function buildOctaneStyle(baseStyle: any): any {
  if (!baseStyle || typeof baseStyle !== 'object') {
    return DARK_RASTER_STYLE;
  }
  // Deep clone so mutations are isolated and don't affect cached source JSON
  const style = JSON.parse(JSON.stringify(baseStyle));

  for (const layer of style.layers ?? []) {
    const id: string = layer.id ?? '';
    const sourceLayer: string = layer['source-layer'] ?? '';
    const isLabel = id.endsWith('-label') || id.includes('-label-');
    const isRoad =
      sourceLayer === 'transportation' ||
      sourceLayer === 'transportation_name' ||
      id.startsWith('road') || id.startsWith('highroad');

    // Land cover (fills): same canvas color as background keeps the theme flat.
    if (layer.type === 'fill' && (sourceLayer === 'landcover' || id === 'land')) {
      if (layer.paint && 'fill-color' in layer.paint) {
        layer.paint['fill-color'] = OCTANE_COLORS.land;
      }
    }

    // Water.
    if (layer.type === 'fill' && (sourceLayer === 'water' || id.startsWith('water'))) {
      if (layer.paint && 'fill-color' in layer.paint) {
        layer.paint['fill-color'] = OCTANE_COLORS.water;
      }
    }

    // Parks / green areas.
    if (layer.type === 'fill' && (sourceLayer === 'park' || id.includes('park') || id.includes('grass') || id.includes('wood'))) {
      if (layer.paint && 'fill-color' in layer.paint) {
        layer.paint['fill-color'] = OCTANE_COLORS.green;
      }
    }

    // Roads: motorways read in the accent, trunks a half-step dimmer, the
    // rest stay dim — a driving app's roads should be the map's hero.
    if (isRoad) {
      if (layer.type === 'line' && layer.paint && 'line-color' in layer.paint) {
        const cls = (layer as any).filter?.toString?.() ?? '';
        const isMotorway = sourceLayer === 'transportation' &&
          (/(motorway|trunk)/.test(cls) || id.includes('highroad'));
        if (isMotorway) {
          layer.paint['line-color'] = OCTANE_COLORS.accent;
          if ('line-opacity' in layer.paint) layer.paint['line-opacity'] = 0.85;
        } else if (sourceLayer === 'transportation_name') {
          layer.paint['line-color'] = OCTANE_COLORS.roadMajor;
        } else {
          layer.paint['line-color'] = OCTANE_COLORS.roadMinor;
        }
      }
      // Bridge outlines shouldn't pop brighter than the roads they carry.
      if (layer.type === 'line' && layer.paint && 'line-color' in layer.paint && id.includes('bridge')) {
        layer.paint['line-color'] = OCTANE_COLORS.dark;
      }
    }

    // All labels: brand text + deep halo for legibility on the dark canvas.
    if (isLabel && layer.paint) {
      if ('text-color' in layer.paint) layer.paint['text-color'] = OCTANE_COLORS.label;
      if ('text-halo-color' in layer.paint) layer.paint['text-halo-color'] = OCTANE_COLORS.labelHalo;
      if ('text-halo-width' in layer.paint && layer.paint['text-halo-width'] < 1) {
        layer.paint['text-halo-width'] = 1.2;
      }
    }
  }

  // Base canvas color, if the style carries a background layer by id.
  for (const layer of style.layers ?? []) {
    if (layer.type === 'background' && layer.paint) {
      layer.paint['background-color'] = OCTANE_COLORS.land;
    }
  }

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