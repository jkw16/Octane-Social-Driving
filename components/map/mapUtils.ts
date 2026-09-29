import * as maplibregl from 'maplibre-gl';

/**
 * Run `fn` (addSource/addLayer setup) once the map style is ready to accept it.
 *
 * MapLibre 6 throws "Style is not done loading" when addSource runs before
 * the style finishes loading. We run immediately if the style is already loaded,
 * and listen on 'style.load' so sources/layers are safely initialized and re-applied
 * if the basemap style changes or falls back.
 */
export const whenStyleReady = (map: maplibregl.Map, fn: () => void) => {
  if (map.isStyleLoaded()) {
    try {
      fn();
    } catch (e) {
      console.warn('whenStyleReady immediate execution error:', e);
    }
  }
  map.on('style.load', () => {
    try {
      fn();
    } catch (e) {
      console.warn('whenStyleReady style.load handler error:', e);
    }
  });
};