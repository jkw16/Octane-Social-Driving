import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Crosshair, Navigation, RefreshCw, PenTool, Undo, Trash2, Save, X, Flag, CheckCircle2, AlertCircle } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import { SessionResult } from '../types';
import { supabase, isSupabaseConfigured } from '../supabase/client';
import { geminiGenerate, responseText, responseChunks } from '../supabase/gemini';
import { MapCanvas, addGeoJsonSource, updateGeoJsonSource } from './map';
import { createUserPuckMarker, createTrackMarker } from './map/markers';

interface TrackGeofence { id: string; name: string; lat: number; lng: number; radius: number }
interface WitnessPoint { lat: number; lng: number; ts: string }

// Great-circle distance in miles between two lat/lng fixes.
const haversineMiles = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Seconds → "m:ss" or "h:mm:ss"
const formatDuration = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
};

export const TrackMode: React.FC = () => {
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [checking, setChecking] = useState(true);
  const [activeRoute, setActiveRoute] = useState<string | null>(null);

  // Real Location State
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Nearest Track (Google Maps)
  const [nearestTrack, setNearestTrack] = useState<{name: string, distance: string, uri?: string} | null>(null);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);

  // Creator Mode State
  const [isCreatorMode, setIsCreatorMode] = useState(false);
  const [routePoints, setRoutePoints] = useState<{lat: number, lng: number}[]>([]);
  const creatorMapInstance = useRef<maplibregl.Map | null>(null);
  const routeMarkersRef = useRef<maplibregl.Marker[]>([]);

  // --- Session Recorder: one button records speed, time, and distance ---
  const [isRecording, setIsRecording] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [sessionDistance, setSessionDistance] = useState(0);   // miles
  const [sessionTopSpeed, setSessionTopSpeed] = useState(0);    // mph
  const [sessionSafetyEvents, setSessionSafetyEvents] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastSession, setLastSession] = useState<SessionResult | null>(null);
  const [submitStatus, setSubmitStatus] = useState<{ kind: 'idle' | 'submitting' | 'ok' | 'error'; msg?: string }>({ kind: 'idle' });
  // The GPS watch effect runs once (deps []), so its callback closes over the
  // initial render. Use refs to read/write live recording state from inside it.
  const isRecordingRef = useRef(false);
  const lastFixRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevSpeedRef = useRef<number | null>(null);       // mph, for harsh-braking detection
  const prevFixTsRef = useRef<number | null>(null);       // ms timestamp of prev fix
  const witnessRef = useRef<WitnessPoint[]>([]);          // sampled GPS points for validation
  const activeTrackIdRef = useRef<string | null>(null);   // circuit geofence the session is in
  const sessionStartIsoRef = useRef<string | null>(null);
  const tracksRef = useRef<TrackGeofence[]>([]);

  // GPS watch drives the live speedometer. Track Mode is no longer geofenced —
  // it's available anywhere, on or off a recognized circuit.
  useEffect(() => {
    if (!navigator.geolocation) {
        setGpsError("Geolocation not supported");
        setChecking(false);
        return;
    }

    const watchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            setUserLocation({ lat, lng });
            // Real GPS speed (m/s → mph) whenever the device reports it.
            let reportedSpeed: number | null = null;
            if (position.coords.speed !== null) {
                 reportedSpeed = Math.round(position.coords.speed * 2.23694);
                 setCurrentSpeed(reportedSpeed);
            }

            // While a session is recording, accumulate distance between fixes,
            // track top speed, count harsh-braking events (Safety), sample
            // witness points, and detect the circuit geofence (Track Speed).
            if (isRecordingRef.current) {
                if (lastFixRef.current) {
                    const d = haversineMiles(lastFixRef.current.lat, lastFixRef.current.lng, lat, lng);
                    if (d > 3 / 1609.344) {
                        setSessionDistance(prev => prev + d);
                    }
                }
                lastFixRef.current = { lat, lng };

                // Harsh-braking detection: > 12 mph/s deceleration (≈0.54 g).
                if (reportedSpeed !== null && prevSpeedRef.current !== null && prevFixTsRef.current !== null) {
                    const dt = (position.timestamp - prevFixTsRef.current) / 1000;
                    if (dt > 0 && dt < 10) {
                        const decel = (prevSpeedRef.current - reportedSpeed) / dt;
                        if (decel > 12) setSessionSafetyEvents(c => c + 1);
                    }
                }
                if (reportedSpeed !== null) {
                    prevSpeedRef.current = reportedSpeed;
                    if (reportedSpeed > 0) {
                        setSessionTopSpeed(prev => Math.max(prev, reportedSpeed!));
                    }
                }
                prevFixTsRef.current = position.timestamp;

                // Sample witness points (cap ~60) for server-side geofence validation.
                const w = witnessRef.current;
                if (w.length === 0 || position.timestamp - (w[w.length - 1]?.ts ? Date.parse(w[w.length - 1].ts) : 0) >= 2000) {
                    w.push({ lat, lng, ts: new Date(position.timestamp).toISOString() });
                    if (w.length > 60) w.shift();
                }

                // Client-side geofence: which circuit (if any) is this fix inside?
                if (tracksRef.current.length) {
                    let found: string | null = null;
                    for (const t of tracksRef.current) {
                        if (haversineMiles(lat, lng, t.lat, t.lng) * 1609.344 <= t.radius) { found = t.id; break; }
                    }
                    activeTrackIdRef.current = found;
                }
            }

            setChecking(false);
        },
        (error) => {
            console.error("GPS Error", error);
            setGpsError("GPS Signal Lost");
            setChecking(false);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Live elapsed-time ticker while recording.
  useEffect(() => {
    if (!isRecording || sessionStartTime === null) return;
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isRecording, sessionStartTime]);

  // Load the circuit catalog once (for client-side geofence → trackId).
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.from('tracks').select('id, name, lat, lng, radius')
      .then(({ data, error }) => {
        if (!error && data) tracksRef.current = data as TrackGeofence[];
      });
  }, []);

  // Fetch Nearest Track when location is first found
  useEffect(() => {
      if (userLocation && !nearestTrack && !isLoadingTrack && !isCreatorMode) {
          findNearestTrack(userLocation.lat, userLocation.lng);
      }
  }, [userLocation, nearestTrack, isLoadingTrack, isCreatorMode]);

  // Creator Mode Map — setup handed to MapCanvas, which mounts the map when
  // the creator view renders and tears it down when it unmounts.
  const setupCreatorMap = (map: maplibregl.Map) => {
    creatorMapInstance.current = map;

    // Add user marker if location available
    if (userLocation) {
      createUserPuckMarker().setLngLat([userLocation.lng, userLocation.lat]).addTo(map);
    }

    // Route line source + layer (dashed cyan).
    addGeoJsonSource(
      map,
      'route',
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      [
        {
          id: 'route',
          type: 'line',
          paint: {
            'line-color': '#06b6d4',
            'line-width': 4,
            'line-opacity': 0.7,
            'line-dasharray': [2, 2],
          },
        },
      ]
    );

    // Map tile/network errors are logged, never fatal — the creator UI and
    // tap-to-place still work even if the basemap can't load.
    map.on('error', (e) => { console.warn('Route-creator map error:', e && e.error ? e.error : e); });

    map.on('click', (e) => {
      setRoutePoints(prev => [...prev, { lat: e.lngLat.lat, lng: e.lngLat.lng }]);
    });

    return () => {
      creatorMapInstance.current = null;
      routeMarkersRef.current.forEach(m => m.remove());
      routeMarkersRef.current = [];
    };
  };

  // Update Route Visuals
  useEffect(() => {
    const map = creatorMapInstance.current;
    if (!map) return;

    // Remove old markers
    routeMarkersRef.current.forEach(m => m.remove());
    routeMarkersRef.current = [];

    // Draw markers (DOM): start green, end red, mid cyan
    routePoints.forEach((point, index) => {
      const kind = index === 0 ? 'start' : index === routePoints.length - 1 ? 'finish' : 'checkpoint';
      const m = createTrackMarker(kind).setLngLat([point.lng, point.lat]).addTo(map);
      routeMarkersRef.current.push(m);
    });

    // Update polyline
    updateGeoJsonSource(map, 'route', {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: routePoints.map(p => [p.lng, p.lat]) },
      properties: {},
    });
  }, [routePoints]);

  const findNearestTrack = async (lat: number, lng: number) => {
      if (!supabase) return;
      // AI features go through the gemini-proxy Edge Function, which requires
      // a signed-in session (JWT verification). Guests skip the nearest-circuit lookup.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setIsLoadingTrack(true);
      try {
          const response = await geminiGenerate({
              contents: "Find the single nearest automotive race track — a real road course or racing circuit built for full-size automobiles (cars), not karts. Strictly EXCLUDE go-kart tracks, karting centers, family fun centers (like Bob-O's), amusement parks, and anything that is not an automotive road course or closed circuit for cars. Calculate the driving distance.",
              config: {
                  tools: [{ googleMaps: {} }],
                  toolConfig: {
                      retrievalConfig: {
                          latLng: { latitude: lat, longitude: lng }
                      }
                  }
              }
          });

          const chunks = responseChunks(response);
          const text = responseText(response);

          let trackName = "Unknown Circuit";
          let trackUri = "";

          const mapChunk = chunks?.find((c: any) => c.web?.title || c.web?.uri);

          if (mapChunk && mapChunk.web) {
              trackName = mapChunk.web.title || trackName;
              trackUri = mapChunk.web.uri || "";
          } else {
              trackName = text.split(',')[0] || "Nearest Circuit";
          }

          const distanceMatch = text.match(/(\d+(\.\d+)?)\s*(miles|mi|km)/i);
          const distanceDisplay = distanceMatch ? distanceMatch[0] : "Calculating...";

          setNearestTrack({
              name: trackName,
              distance: distanceDisplay,
              uri: trackUri
          });

      } catch (e) {
          console.error("Failed to find track via Google Maps:", e);
          setNearestTrack({
              name: "Nearest Circuit",
              distance: "Unknown",
              uri: ""
          });
      } finally {
          setIsLoadingTrack(false);
      }
  };

  const submitSession = async (
    session: SessionResult,
    safetyEvents: number,
    trackId: string | null,
    witness: WitnessPoint[],
    startedAt: string
  ) => {
    if (!isSupabaseConfigured || !supabase) { setSubmitStatus({ kind: 'idle' }); return; }
    setSubmitStatus({ kind: 'submitting' });
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) { setSubmitStatus({ kind: 'error', msg: 'Sign in to post scores' }); return; }
      const { error } = await supabase.functions.invoke('submit-drive', {
        body: {
          trackId,
          startedAt,
          endedAt: session.date,
          distanceMi: session.distance,
          topSpeedMph: session.topSpeed,
          avgSpeedMph: Math.round(session.avgSpeed),
          safetyEvents,
          witness,
        },
      });
      if (error) setSubmitStatus({ kind: 'error', msg: error.message });
      else setSubmitStatus({ kind: 'ok', msg: 'Submitted to leaderboard' });
    } catch (e: any) {
      setSubmitStatus({ kind: 'error', msg: e?.message ?? 'Submit failed' });
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      // Stop & save: snapshot the session, then reset for the next run.
      const duration = elapsedSeconds;
      const distance = sessionDistance;
      const topSpeed = sessionTopSpeed;
      const avgSpeed = duration > 0 ? distance / (duration / 3600) : 0;
      const safetyEvents = sessionSafetyEvents;
      const witness = [...witnessRef.current];
      const trackId = activeTrackIdRef.current;
      const startedAt = sessionStartIsoRef.current ?? new Date().toISOString();
      const session: SessionResult = {
        distance,
        duration,
        topSpeed,
        avgSpeed,
        date: new Date().toISOString(),
      };
      setLastSession(session);
      // Submit to the backend (no-op if Supabase isn't configured / signed out).
      void submitSession(session, safetyEvents, trackId, witness, startedAt);

      isRecordingRef.current = false;
      setIsRecording(false);
      setSessionStartTime(null);
      setSessionDistance(0);
      setSessionTopSpeed(0);
      setSessionSafetyEvents(0);
      setElapsedSeconds(0);
      lastFixRef.current = null;
      prevSpeedRef.current = null;
      prevFixTsRef.current = null;
      witnessRef.current = [];
      activeTrackIdRef.current = null;
      sessionStartIsoRef.current = null;
    } else {
      // Start a fresh session, seeded from the current GPS fix if we have one.
      isRecordingRef.current = true;
      lastFixRef.current = userLocation ? { ...userLocation } : null;
      prevSpeedRef.current = null;
      prevFixTsRef.current = null;
      witnessRef.current = [];
      activeTrackIdRef.current = null;
      sessionStartIsoRef.current = new Date().toISOString();
      setSubmitStatus({ kind: 'idle' });
      setSessionStartTime(Date.now());
      setElapsedSeconds(0);
      setSessionDistance(0);
      setSessionTopSpeed(0);
      setSessionSafetyEvents(0);
      setIsRecording(true);
    }
  };

  const handleNavigate = () => {
      if (nearestTrack?.uri) {
          window.open(nearestTrack.uri, '_blank');
      } else if (nearestTrack?.name) {
          window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nearestTrack.name)}`, '_blank');
      }
  };

  const handleSaveCustomRoute = () => {
      setActiveRoute("Custom Route");
      setIsCreatorMode(false);
      setRoutePoints([]);
  };

  // --- Views ---

  if (isCreatorMode) {
      return (
          <div className="fixed inset-0 z-50 bg-gray-900">
              <MapCanvas
                className="absolute inset-0 z-0"
                center={[userLocation?.lng || -118.2437, userLocation?.lat || 34.0522]}
                zoom={15}
                onReady={setupCreatorMap}
              />

              <div className="absolute top-[calc(env(safe-area-inset-top)_+_1rem)] left-4 right-4 z-10 flex justify-between items-start pointer-events-none">
                  <div className="bg-octane-black/80 backdrop-blur border border-white/10 p-3 rounded-xl pointer-events-auto shadow-lg">
                      <h3 className="text-white font-bold text-sm flex items-center gap-2">
                          <PenTool className="w-4 h-4 text-octane-accent" /> Route Creator
                      </h3>
                      <p className="text-[10px] text-gray-400 mt-1">Tap map to place checkpoints</p>
                  </div>
                  <button onClick={() => setIsCreatorMode(false)} className="pointer-events-auto bg-octane-black/80 p-2 rounded-full text-white border border-white/10">
                      <X className="w-5 h-5" />
                  </button>
              </div>

              <div className="absolute bottom-28 left-4 right-4 z-10 space-y-2 pointer-events-none">
                  <div className="flex justify-end gap-2 pointer-events-auto">
                      <button
                        onClick={() => setRoutePoints(prev => prev.slice(0, -1))}
                        disabled={routePoints.length === 0}
                        className="bg-gray-800 text-white p-3 rounded-lg border border-white/10 disabled:opacity-50"
                      >
                          <Undo className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setRoutePoints([])}
                        disabled={routePoints.length === 0}
                        className="bg-gray-800 text-red-400 p-3 rounded-lg border border-white/10 disabled:opacity-50"
                      >
                          <Trash2 className="w-5 h-5" />
                      </button>
                  </div>
                  <button
                      onClick={handleSaveCustomRoute}
                      disabled={routePoints.length < 2}
                      className="w-full pointer-events-auto bg-octane-accent text-black font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale"
                  >
                      <Save className="w-4 h-4" /> Save & Test Drive
                  </button>
              </div>
          </div>
      );
  }

  if (checking) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-4 animate-pulse">
        <MapPin className="w-12 h-12 text-octane-accent" />
        <h2 className="text-xl font-display font-bold">Acquiring GPS Satellite...</h2>
      </div>
    );
  }

  // Live Track Mode — always available, no geofence.
  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.05)_1px,transparent_1px)] bg-[size:40px_40px]"></div>

      <div className="relative z-10 h-full flex flex-col">
        {/* Status banner — pinned top, never overlaps the gauges */}
        <div className="shrink-0 pt-4 flex justify-center px-4">
            {activeRoute ? (
                <div className="px-4 py-1 rounded-full text-xs font-bold border flex items-center gap-2 bg-octane-success/20 text-octane-success border-octane-success/50">
                    <Flag className="w-3 h-3" /> DRIVING: {activeRoute}
                </div>
            ) : userLocation ? (
                <div className="px-4 py-1 rounded-full text-xs font-bold border flex items-center gap-2 bg-octane-accent/20 text-octane-accent border-octane-accent/50">
                    <MapPin className="w-3 h-3" /> LIVE
                </div>
            ) : (
                <div className="px-4 py-1 rounded-full text-xs font-bold border flex items-center gap-2 bg-octane-danger/20 text-octane-danger border-octane-danger/50">
                    <Crosshair className="w-3 h-3" /> {gpsError || "NO GPS"}
                </div>
            )}
        </div>

        {/* Speedometer + session recorder — centered when it fits, scrolls
            top-to-bottom when tall. Centering lives on the inner min-h-full
            element (NOT the scroll container) so overflow stays reachable and
            never springs back to the top. */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
            <div className="min-h-full flex flex-col items-center justify-center px-4 py-2">
            {/* Speedometer */}
            <div className="relative w-56 h-56 flex items-center justify-center shrink-0">
                <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-octane-accent rounded-full border-t-transparent border-l-transparent rotate-45"></div>
                <div className="flex flex-col items-center">
                    <span className="text-7xl font-display font-black text-white tracking-tighter tabular-nums">
                        {currentSpeed}
                    </span>
                    <span className="text-base text-gray-400 font-bold uppercase tracking-widest mt-1">MPH</span>
                </div>
            </div>

            {/* Session Recorder — one button records speed, time, distance */}
            <div className="mt-5 w-full max-w-sm bg-octane-dark/80 border border-white/10 rounded-xl p-4 shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Session Recorder</div>
                    {isRecording ? (
                        <span className="flex items-center gap-1.5 text-xs font-bold text-octane-danger">
                            <span className="w-2 h-2 rounded-full bg-octane-danger animate-pulse" /> REC
                        </span>
                    ) : (
                        <span className="text-xs font-mono text-gray-600 uppercase">Idle</span>
                    )}
                </div>

                {/* Live readout while recording */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                        <div className="text-[10px] text-gray-500 uppercase">Time</div>
                        <div className="text-lg font-mono text-white tabular-nums">{formatDuration(elapsedSeconds)}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 uppercase">Distance</div>
                        <div className="text-lg font-mono text-octane-accent tabular-nums">
                            {sessionDistance.toFixed(2)}<span className="text-xs text-gray-500 ml-0.5">mi</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 uppercase">Top Speed</div>
                        <div className="text-lg font-mono text-octane-success tabular-nums">
                            {sessionTopSpeed}<span className="text-xs text-gray-500 ml-0.5">mph</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 uppercase">Harsh Brakes</div>
                        <div className={`text-lg font-mono tabular-nums ${sessionSafetyEvents > 0 ? 'text-octane-danger' : 'text-gray-400'}`}>
                            {sessionSafetyEvents}
                        </div>
                    </div>
                </div>

                <button
                    onClick={toggleRecording}
                    className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${isRecording ? 'bg-octane-danger text-white' : 'bg-octane-accent text-black'}`}
                >
                    {isRecording ? (
                        <><span className="w-3 h-3 bg-white rounded-sm" /> Stop &amp; Save</>
                    ) : (
                        <><span className="w-3 h-3 bg-black rounded-full" /> Start Recording</>
                    )}
                </button>

                {submitStatus.kind !== 'idle' && (
                    <div className={`mt-2 flex items-center gap-1.5 text-[11px] font-mono ${
                        submitStatus.kind === 'ok' ? 'text-octane-success'
                        : submitStatus.kind === 'error' ? 'text-octane-danger'
                        : 'text-gray-500'
                    }`}>
                        {submitStatus.kind === 'ok' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {submitStatus.kind === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
                        {submitStatus.kind === 'submitting' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        {submitStatus.msg}
                    </div>
                )}
            </div>

            {/* Last Session — view the recorded info */}
            <div className="mt-3 w-full max-w-sm bg-octane-dark/80 border border-white/10 rounded-xl p-4 shrink-0">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Last Session</div>
                {lastSession ? (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase">Distance</div>
                                <div className="text-xl font-mono text-octane-accent tabular-nums">
                                    {lastSession.distance.toFixed(2)}<span className="text-xs text-gray-500 ml-1">mi</span>
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase">Duration</div>
                                <div className="text-xl font-mono text-white tabular-nums">{formatDuration(lastSession.duration)}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase">Top Speed</div>
                                <div className="text-xl font-mono text-octane-success tabular-nums">
                                    {lastSession.topSpeed}<span className="text-xs text-gray-500 ml-1">mph</span>
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-500 uppercase">Avg Speed</div>
                                <div className="text-xl font-mono text-white tabular-nums">
                                    {lastSession.avgSpeed.toFixed(1)}<span className="text-xs text-gray-500 ml-1">mph</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-[10px] text-gray-600 mt-2">{new Date(lastSession.date).toLocaleString()}</div>
                    </>
                ) : (
                    <div className="text-center text-gray-600 text-xs py-2">No session recorded yet — press Start Recording.</div>
                )}
            </div>
            </div>
        </div>

        {/* Bottom action bar — pinned bottom, never overlaps the gauges.
             pb-28 clears the fixed app tab bar (fixed bottom-0 in App.tsx) so
             the Design Custom Route button isn't tucked behind it. */}
        <div className="shrink-0 p-4 pb-28 space-y-2">
            {activeRoute && (
                <button
                    onClick={() => setActiveRoute(null)}
                    className="w-full py-2.5 bg-octane-dark/80 backdrop-blur text-gray-300 border border-white/10 rounded-xl text-xs font-bold hover:text-white transition-colors flex items-center justify-center gap-2"
                >
                    <X className="w-3.5 h-3.5" /> End Route
                </button>
            )}

            {!activeRoute && nearestTrack && (
                <button
                    onClick={handleNavigate}
                    className="w-full flex items-center justify-between bg-octane-dark/80 backdrop-blur border border-white/10 p-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                    <div className="min-w-0 text-left">
                        <div className="text-[10px] font-mono text-gray-500 uppercase">Nearest Circuit</div>
                        <div className="text-white font-bold text-sm truncate">{nearestTrack.name}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-octane-accent text-xs font-mono">{nearestTrack.distance}</span>
                        <Navigation className="w-4 h-4 text-blue-400" />
                    </div>
                </button>
            )}

            {!activeRoute && isLoadingTrack && !nearestTrack && (
                <div className="w-full flex items-center justify-center gap-2 bg-octane-dark/80 backdrop-blur border border-white/10 p-3 rounded-xl text-gray-400 text-xs font-mono uppercase">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Finding nearest circuit…
                </div>
            )}

            <button
                onClick={() => setIsCreatorMode(true)}
                className="w-full px-4 py-3 bg-white/5 text-white rounded-xl hover:bg-white/10 transition-colors font-bold border border-white/10 flex items-center justify-center gap-2"
            >
                <PenTool className="w-4 h-4 text-octane-accent" /> Design Custom Route
            </button>
        </div>
      </div>
    </div>
  );
};