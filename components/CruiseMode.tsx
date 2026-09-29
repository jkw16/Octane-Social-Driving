import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { Navigation, Search, ArrowRight, X, Loader2, Map as MapIcon, ChevronRight } from 'lucide-react';
import { MapCanvas, addGeoJsonSource, updateGeoJsonSource } from './map';
import { createCarPuckMarker, setCarPuckHeading } from './map/markers';
import { resolvePlaceNear, hasAiPlacesSession } from '../services/geocoding';

// Build a GeoJSON Polygon approximating a geographic circle of `radiusMeters`
// around [lng, lat] using the destination-point formula (haversine-based).
// MapLibre's `circle` layer type is screen-pixel radius, not meters, so we
// draw a 64-sided polygon ring instead. 500 ft proxy-chat range = 152.4 m.
const circleGeoJSON = (lng: number, lat: number, radiusMeters: number) => {
  const R = 6378137; // earth radius (m)
  const delta = radiusMeters / R;
  const latRad = (lat * Math.PI) / 180;
  const steps = 64;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i * 360) / steps; // degrees; closes the ring (last == first)
    const thetaRad = (theta * Math.PI) / 180;
    const lat2Rad = Math.asin(
      Math.sin(latRad) * Math.cos(delta) +
        Math.cos(latRad) * Math.sin(delta) * Math.cos(thetaRad)
    );
    const lng2Rad =
      (lng * Math.PI) / 180 +
      Math.atan2(
        Math.sin(thetaRad) * Math.sin(delta) * Math.cos(latRad),
        Math.cos(delta) - Math.sin(latRad) * Math.sin(lat2Rad)
      );
    ring.push([(lng2Rad * 180) / Math.PI, (lat2Rad * 180) / Math.PI]);
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: {},
  };
};

const RANGE_RADIUS_M = 152.4; // 500 ft in meters

export const CruiseMode: React.FC = () => {
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [speed, setSpeed] = useState(0);
  const [heading, setHeading] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);

  // Full-screen map toggle. Default to the menu (cards); map mounts on demand.
  const [mapOpen, setMapOpen] = useState(false);
  // In-page map diagnostics — surfaces MapLibre load/error events as text so a
  // blank map can be diagnosed without browser dev tools.
  const [mapStatus, setMapStatus] = useState<string>('Initializing…');

  // Route / Smart Search State
  const [destinationInput, setDestinationInput] = useState('');
  const [isRouteActive, setIsRouteActive] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [resolvedPlace, setResolvedPlace] = useState<{
      name: string;
      address?: string;
      rating?: number;
      uri?: string;
  } | null>(null);

  // GPS tracking — always running so the speed card works in the menu,
  // and so the map can center on the user the moment it opens.
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed: gpsSpeed, heading: gpsHeading } = pos.coords;
        setSpeed(gpsSpeed ? Math.round(gpsSpeed * 2.23694) : 0);
        setCurrentLocation({ lat: latitude, lng: longitude });
        if (gpsHeading) setHeading(gpsHeading);

        if (mapInstanceRef.current && markerRef.current) {
          markerRef.current.setLngLat([longitude, latitude]);
          // Glide to each fix instead of jumping — easeTo over the interval
          // between fixes reads like a car moving, not a teleport. Linear
          // easing (no bow) so chained easeTo calls don't pulse.
          mapInstanceRef.current.easeTo({
            center: [longitude, latitude],
            zoom: 16,
            duration: 750,
            easing: (t) => t,
          });
          if (gpsHeading) setCarPuckHeading(markerRef.current, gpsHeading);
          // Move the 500-ft range circle with the user.
          updateGeoJsonSource(
            mapInstanceRef.current,
            'range',
            circleGeoJSON(longitude, latitude, RANGE_RADIUS_M)
          );
        }
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Map — only mounted when the user opens it full-screen. All construction
  // and cleanup lives in MapCanvas; this wires up the cruise-specific bits:
  // user marker, 500-ft range circle and the in-page load diagnostics.
  const setupCruiseMap = (map: maplibregl.Map) => {
    const center: [number, number] = currentLocation
      ? [currentLocation.lng, currentLocation.lat]
      : [-118.2437, 34.0522]; // [lng, lat] — default LA

    mapInstanceRef.current = map;

    // User marker — car puck with a heading needle (rotates as GPS heading
    // streams in; see the watch effect).
    const marker = createCarPuckMarker().setLngLat(center).addTo(map);
    markerRef.current = marker;

    // 500-ft proxy-chat range circle — light-blue transparent fill around the
    // user, drawn as a GeoJSON polygon (MapLibre `circle` is screen px, not m).
    addGeoJsonSource(
      map,
      'range',
      circleGeoJSON(center[0], center[1], RANGE_RADIUS_M),
      [
        {
          id: 'range-fill',
          type: 'fill',
          paint: { 'fill-color': '#06b6d4', 'fill-opacity': 0.15 },
        },
        {
          id: 'range-border',
          type: 'line',
          paint: { 'line-color': '#06b6d4', 'line-width': 1, 'line-opacity': 0.4 },
        },
      ]
    );

    // In-page diagnostics — surfaces MapLibre load/error events as text so a
    // blank map can be diagnosed without browser dev tools.
    let tilesLoaded = 0;
    map.on('load', () => { setMapStatus(`Style loaded — ${tilesLoaded} tiles`); });
    map.on('style.load', () => setMapStatus('Style loaded — fetching tiles…'));
    // Count tiles as they arrive so we get positive confirmation the basemap is
    // actually loading (vs. silently blocked).
    map.on('sourcedata', (e: any) => {
      if (e?.isSourceLoaded && e?.sourceDataType === 'tiles' && e?.tile) {
        tilesLoaded += 1;
        setMapStatus(`Loaded ${tilesLoaded} tiles`);
      }
    });
    // Surface every map error in-page (tile/source/style/WebGL failures) so a
    // blank map can be diagnosed without dev tools.
    map.on('error', (e: any) => {
      const msg = e?.error?.message || e?.error?.status || (e?.source ? `source "${e.source}" failed` : 'tile/source error');
      setMapStatus(`ERROR: ${msg}`);
    });

    return () => {
      markerRef.current?.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  };

  const handleSmartSearch = async () => {
      if (!destinationInput.trim()) return;
      // Places lookups are proxied through the gemini-proxy Edge Function
      // (requires sign-in) — see services/geocoding.ts.
      if (!(await hasAiPlacesSession())) return;

      setIsSearching(true);
      setResolvedPlace(null);

      try {
        const place = await resolvePlaceNear(
          destinationInput,
          currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : undefined
        );
        setResolvedPlace({
            name: place.name,
            address: "Tap navigate for details", // Simplified for UI
            uri: place.uri
        });
        setIsRouteActive(true);

      } catch (error) {
          console.error("Maps Grounding Error:", error);
          // Fallback to manual input
          setResolvedPlace({
              name: destinationInput,
              address: "Custom Destination",
              uri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinationInput)}`
          });
          setIsRouteActive(true);
      } finally {
          setIsSearching(false);
      }
  };

  const handleStartNavigation = () => {
      if (!resolvedPlace) return;

      const url = resolvedPlace.uri
        ? resolvedPlace.uri
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(resolvedPlace.name)}&travelmode=driving`;

      window.open(url, '_blank');
  };

  return (
    <div className="h-full w-full relative bg-gray-900 overflow-hidden flex flex-col">
      {mapOpen ? (
        // Fixed full-screen overlay: the map container gets real viewport
        // pixels (100vw x 100vh) independent of the flex/percentage-height chain
        // above, which collapses to 0 on some mobile browsers and leaves
        // MapLibre rendering nothing.
        <div className="fixed inset-0 z-50 bg-gray-900">
          <MapCanvas
            className="absolute inset-0"
            center={currentLocation ? [currentLocation.lng, currentLocation.lat] : [-118.2437, 34.0522]}
            zoom={16}
            onReady={setupCruiseMap}
          />
          <button
            onClick={() => setMapOpen(false)}
            className="absolute top-4 right-4 z-10 bg-octane-black/90 border border-white/10 rounded-full p-2 text-white hover:bg-octane-black transition-colors shadow-2xl"
            aria-label="Close map"
          >
            <X className="w-5 h-5" />
          </button>
          {/* In-page diagnostics — read this text to diagnose a blank map. */}
          <div className="absolute top-4 left-4 z-10 max-w-[80%] bg-octane-black/90 border border-white/10 rounded-lg px-3 py-2 text-[11px] font-mono text-white shadow-2xl pointer-events-none">
            map: {mapStatus}
          </div>
        </div>
      ) : (
        /* Menu — three cards: search, open map, speed */
        <div className="relative z-10 h-full w-full p-4 pb-24 flex flex-col gap-4 overflow-y-auto">
          {/* Card 1 — Location search / destination */}
          {!isRouteActive ? (
            <div className="bg-octane-black/90 p-2 rounded-xl border border-white/10 backdrop-blur-md shadow-2xl">
              <div className="flex items-center gap-2 px-2">
                <Search className={`w-5 h-5 ${isSearching ? 'text-octane-accent animate-pulse' : 'text-gray-400'}`} />
                <input
                  type="text"
                  value={destinationInput}
                  onChange={(e) => setDestinationInput(e.target.value)}
                  placeholder="Search places (e.g. Shell, Cafe)..."
                  className="flex-1 bg-transparent border-none text-white focus:outline-none py-3 text-sm font-medium placeholder-gray-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleSmartSearch()}
                  disabled={isSearching}
                />
                {(destinationInput || isSearching) && (
                  <button
                    onClick={handleSmartSearch}
                    disabled={isSearching}
                    className="bg-octane-accent text-black p-2 rounded-lg font-bold disabled:opacity-50"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-octane-dark/95 p-4 rounded-xl border border-octane-accent/30 backdrop-blur-md shadow-2xl animate-in slide-in-from-top-2">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
                    <MapIcon className="w-3 h-3 text-octane-accent" /> Destination Set
                  </div>
                  <h3 className="text-xl font-bold text-white leading-tight pr-4">{resolvedPlace?.name || destinationInput}</h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-1">{resolvedPlace?.address}</p>
                </div>
                <button onClick={() => { setIsRouteActive(false); setDestinationInput(''); setResolvedPlace(null); }} className="text-gray-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                  <div className="text-[10px] text-gray-500">Routing</div>
                  <div className="text-white font-mono font-bold text-xs">Google Maps</div>
                </div>
                <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                  <div className="text-[10px] text-gray-500">Status</div>
                  <div className="text-octane-success font-mono font-bold text-xs">Ready</div>
                </div>
              </div>

              <button
                onClick={handleStartNavigation}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Navigation className="w-4 h-4 fill-current" />
                Start Navigation
              </button>
            </div>
          )}

          {/* Card 2 — Open full-screen map */}
          <button
            onClick={() => { setMapStatus('Initializing…'); setMapOpen(true); }}
            className="bg-octane-black/90 p-4 rounded-xl border border-white/10 backdrop-blur-md shadow-2xl flex items-center justify-between text-left transition-colors hover:border-octane-accent/40"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-octane-accent/10 flex items-center justify-center">
                <MapIcon className="w-5 h-5 text-octane-accent" />
              </div>
              <div>
                <div className="text-white font-bold text-sm">Live Map</div>
                <div className="text-gray-500 text-xs">Open full-screen map view</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-500" />
          </button>

          {/* Card 3 — Speed (pinned to bottom) */}
          <div className="mt-auto bg-octane-black/80 backdrop-blur p-4 rounded-2xl border border-white/5 flex justify-between items-center">
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Current Speed</div>
              <div className="text-2xl font-display font-black text-white">{speed} <span className="text-sm text-gray-500 font-sans">MPH</span></div>
            </div>
            <div>
              <Navigation className="w-8 h-8 text-gray-600" style={{ transform: `rotate(${heading}deg)` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};