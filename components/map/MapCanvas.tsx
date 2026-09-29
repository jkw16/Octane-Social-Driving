import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { getOctaneStyle, DARK_RASTER_STYLE } from '../../services/mapStyle';

export type MapStyleSpec = maplibregl.StyleSpecification | Record<string, unknown> | string;

export interface MapCanvasProps {
  /** Classes for the map container div (e.g. "absolute inset-0"). */
  className?: string;
  /**
   * MapLibre style — raster/vector style object, URL string, or Promise resolving to one.
   * If omitted, defaults to getOctaneStyle() (OpenFreeMap vector basemap with raster fallback).
   */
  mapStyle?: MapStyleSpec | Promise<MapStyleSpec>;
  /** [lng, lat]. Defaults to LA, matching previous per-screen defaults. */
  center?: [number, number];
  zoom?: number;
  /**
   * MapLibre ≥4 renders no attribution control by default; we pin the
   * default to `false` so every call site states its intent explicitly.
   */
  attributionControl?: false | maplibregl.AttributionControlOptions;
  /**
   * Called exactly once, after the Map is constructed (before first paint).
   * Add sources, layers, markers and event handlers here. Return a teardown
   * fn to run on unmount (clear instance refs held by the feature component).
   */
  onReady?: (map: maplibregl.Map) => void | (() => void);
}

/**
 * MapCanvas — the single owner of a maplibregl.Map lifecycle.
 *
 * Owns:
 *   1. Map construction from a style (or asynchronous Octane vector basemap),
 *      with screen-specific setup delegated to `onReady`.
 *   2. Mobile resize handling: initial load, next animation frame, and
 *      container dimension changes via ResizeObserver.
 *   3. Resilience: fallback to raster basemap if vector basemap fails.
 *   4. Cleanup on unmount (caller teardown + map.remove()).
 */
export const MapCanvas: React.FC<MapCanvasProps> = ({
  className,
  mapStyle,
  center = [-118.2437, 34.0522] as [number, number],
  zoom = 16,
  attributionControl = false as const,
  onReady,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Keep the latest onReady without re-triggering the mount effect.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isCancelled = false;
    let mapInstance: maplibregl.Map | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let teardown: void | (() => void);
    let hasFallenBack = false;

    const setupMap = (resolvedStyle: maplibregl.StyleSpecification | string) => {
      if (isCancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: resolvedStyle as any,
        center,
        zoom,
        attributionControl,
      });
      mapInstance = map;

      map.once('load', () => map.resize());
      requestAnimationFrame(() => map.resize());

      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          map.resize();
        });
        resizeObserver.observe(containerRef.current);
      }

      // If the vector style encounters a fatal style/source error, fall back to raster
      map.on('error', (e: any) => {
        if (!hasFallenBack && resolvedStyle !== (DARK_RASTER_STYLE as any)) {
          const isStyleError = e?.error?.message?.toLowerCase().includes('style') ||
            (e?.source === 'openmaptiles' && e?.error?.status && e.error.status >= 500);
          if (isStyleError) {
            hasFallenBack = true;
            console.warn('Vector basemap encountered an error; falling back to dark raster style:', e);
            try {
              map.setStyle(DARK_RASTER_STYLE as any);
            } catch (err) {
              console.error('Failed to set fallback raster style:', err);
            }
          }
        }
      });

      teardown = onReadyRef.current?.(map);
    };

    const targetStyle = mapStyle ?? getOctaneStyle();

    if (targetStyle instanceof Promise) {
      targetStyle
        .then((res) => {
          setupMap(res as any);
        })
        .catch((err) => {
          console.warn('MapCanvas failed to resolve style; falling back to dark raster style:', err);
          setupMap(DARK_RASTER_STYLE as any);
        });
    } else {
      setupMap(targetStyle as any);
    }

    return () => {
      isCancelled = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (typeof teardown === 'function') {
        teardown();
      }
      if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className} />;
};