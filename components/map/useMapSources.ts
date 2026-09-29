import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { whenStyleReady } from './mapUtils';

// Whatever MapLibre's GeoJSON source accepts as `data` (GeoJSON geometry /
// feature / collection or a URL string).
export type GeoJsonData = maplibregl.GeoJSONSourceSpecification['data'];

export interface AddGeoJsonOptions {
  sourceOptions?: Omit<maplibregl.GeoJSONSourceSpecification, 'type' | 'data'>;
}

/**
 * Safely adds a GeoJSON source and its associated layers once the map style is loaded.
 * Guards against duplicate source or layer additions (e.g. during fast refresh or re-renders).
 */
export function addGeoJsonSource(
  map: maplibregl.Map,
  sourceId: string,
  data: GeoJsonData,
  layers: (Omit<maplibregl.LayerSpecification, 'source'> & { source?: string })[] = [],
  options?: AddGeoJsonOptions
): void {
  whenStyleReady(map, () => {
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: data as any,
        ...options?.sourceOptions,
      });
    }

    for (const layer of layers) {
      if (!map.getLayer(layer.id)) {
        map.addLayer({
          ...layer,
          source: sourceId,
        } as maplibregl.LayerSpecification);
      }
    }
  });
}

/**
 * Safely updates an existing GeoJSON source's data.
 * No-ops if the map or source does not exist.
 */
export function updateGeoJsonSource(
  map: maplibregl.Map | null | undefined,
  sourceId: string,
  data: GeoJsonData
): void {
  if (!map) return;
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (source && typeof source.setData === 'function') {
    source.setData(data as any);
  }
}

/**
 * React hook to synchronize GeoJSON data with a map source.
 * Automatically updates `source.setData` when `data` changes.
 */
export function useGeoJsonSource(
  map: maplibregl.Map | null | undefined,
  sourceId: string,
  data: GeoJsonData | null | undefined
): void {
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!map || !data) return;
    updateGeoJsonSource(map, sourceId, data);
  }, [map, sourceId, data]);
}
