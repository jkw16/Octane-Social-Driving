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

export interface ClusterSourceOptions extends AddGeoJsonOptions {
  /** Radius that determines cluster groupings, in pixels. Default 60. */
  clusterRadius?: number;
  /** Color of the cluster bubbles (brand accent by default). */
  clusterColor?: string;
  /** Unclustered-point circle color (default: brand accent). */
  pointColor?: string;
}

/**
 * Adds a clustered GeoJSON source + the standard MapLibre cluster recipe
 * (cluster bubbles in brand colors, count labels, unclustered points).
 * Use for meetup pins / many-car groups — the car-level markers still come
 * from components/map/markers.ts. `data` must be a FeatureCollection of
 * Points (clustered sources cannot render other geometries).
 */
export function addClusteredSource(
  map: maplibregl.Map,
  sourceId: string,
  data: GeoJsonData,
  options: ClusterSourceOptions = {}
): void {
  whenStyleReady(map, () => {
    if (map.getSource(sourceId)) return;
    const accent = options.clusterColor ?? '#06b6d4';
    map.addSource(sourceId, {
      type: 'geojson',
      data: data as any,
      cluster: true,
      clusterRadius: options.clusterRadius ?? 60,
    });
    map.addLayer({
      id: `${sourceId}-clusters`,
      type: 'circle',
      source: sourceId,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': accent,
        'circle-opacity': 0.25,
        'circle-stroke-color': accent,
        'circle-stroke-width': 2,
        'circle-radius': [
          'interpolate', ['linear'], ['get', 'point_count'],
          2, 14,
          10, 24,
          50, 34,
        ],
      },
    });
    map.addLayer({
      id: `${sourceId}-cluster-count`,
      type: 'symbol',
      source: sourceId,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
      },
      paint: {
        'text-color': '#0f172a',
      },
    });
    map.addLayer({
      id: `${sourceId}-unclustered`,
      type: 'circle',
      source: sourceId,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': options.pointColor ?? accent,
        'circle-radius': 9,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
  });
}
