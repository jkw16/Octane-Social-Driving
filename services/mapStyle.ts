// MapLibre basemap style — Esri dark gray canvas (raster).
//
// CARTO's public basemaps.cartocdn.com raster tiles now bake an "API KEY
// REQUIRED" watermark into every tile unless you sign up for a key, so we
// switched to Esri's free, no-key, CORS-open, no-watermark dark gray canvas.
// Raster tiles (one PNG/JPG per tile) render on a wider range of devices than
// vector tiles and aren't silently dropped by content blockers.
//
// Two raster layers are stacked: the dark base (land/water) with the
// transparent reference layer (labels, boundaries, roads) drawn on top.
// GeoJSON layers (e.g. the Track route line) still render above both.

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