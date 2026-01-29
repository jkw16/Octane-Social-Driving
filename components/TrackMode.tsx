
import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, MapPin, Gauge, Lock, ShieldAlert, Crosshair, Navigation, RefreshCw, PenTool, Undo, Trash2, Save, X } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import L from 'leaflet';
import { MOCK_TRACKS } from '../constants';

export const TrackMode: React.FC = () => {
  const [inGeofence, setInGeofence] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [rpm, setRpm] = useState(1000);
  const [checking, setChecking] = useState(true);
  const [simulatedTrack, setSimulatedTrack] = useState<string | null>(null);
  
  // Real Location State
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Real Track Data from Google Maps
  const [nearestTrack, setNearestTrack] = useState<{name: string, distance: string, uri?: string} | null>(null);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);

  // Creator Mode State
  const [isCreatorMode, setIsCreatorMode] = useState(false);
  const [routePoints, setRoutePoints] = useState<{lat: number, lng: number}[]>([]);
  const creatorMapRef = useRef<HTMLDivElement>(null);
  const creatorMapInstance = useRef<L.Map | null>(null);
  const routeLayerGroup = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
        setGpsError("Geolocation not supported");
        setChecking(false);
        return;
    }

    const watchId = navigator.geolocation.watchPosition(
        (position) => {
            const newLoc = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            setUserLocation(newLoc);
            
            // If we have real GPS speed and aren't in a manual simulation override, use it
            if (position.coords.speed !== null && !simulatedTrack && inGeofence) {
                 // Convert m/s to mph
                 setCurrentSpeed(Math.round(position.coords.speed * 2.23694));
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
  }, [simulatedTrack, inGeofence]);

  // Fetch Nearest Track when location is first found
  useEffect(() => {
      if (userLocation && !nearestTrack && !isLoadingTrack && !inGeofence && !isCreatorMode) {
          findNearestTrack(userLocation.lat, userLocation.lng);
      }
  }, [userLocation, nearestTrack, isLoadingTrack, inGeofence, isCreatorMode]);

  // Creator Mode Map Initialization
  useEffect(() => {
    if (!isCreatorMode || !creatorMapRef.current) return;

    if (!creatorMapInstance.current) {
        const startLat = userLocation?.lat || 34.0522;
        const startLng = userLocation?.lng || -118.2437;

        const map = L.map(creatorMapRef.current, { zoomControl: false }).setView([startLat, startLng], 15);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(map);

        // Add user marker if location available
        if (userLocation) {
             const icon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: #06b6d4; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6],
            });
            L.marker([userLocation.lat, userLocation.lng], { icon }).addTo(map);
        }

        routeLayerGroup.current = L.layerGroup().addTo(map);

        map.on('click', (e) => {
            setRoutePoints(prev => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }]);
        });

        creatorMapInstance.current = map;
    }

    return () => {
        if (creatorMapInstance.current) {
            creatorMapInstance.current.remove();
            creatorMapInstance.current = null;
        }
    };
  }, [isCreatorMode]); // Only init on open

  // Update Route Visuals
  useEffect(() => {
      if (!creatorMapInstance.current || !routeLayerGroup.current) return;
      
      const layerGroup = routeLayerGroup.current;
      layerGroup.clearLayers();

      // Draw Markers
      routePoints.forEach((point, index) => {
          const isStart = index === 0;
          const isEnd = index === routePoints.length - 1;
          
          L.circleMarker([point.lat, point.lng], {
              color: isStart ? '#22c55e' : isEnd ? '#ef4444' : '#06b6d4',
              radius: isStart || isEnd ? 8 : 4,
              fillColor: isStart ? '#22c55e' : isEnd ? '#ef4444' : '#06b6d4',
              fillOpacity: 0.8,
              weight: 2
          }).addTo(layerGroup);
      });

      // Draw Polyline
      if (routePoints.length > 1) {
          L.polyline(routePoints.map(p => [p.lat, p.lng]), { 
              color: '#06b6d4', 
              weight: 4,
              opacity: 0.7,
              dashArray: '10, 10', 
              dashOffset: '0'
          }).addTo(layerGroup);
      }
  }, [routePoints]);

  const findNearestTrack = async (lat: number, lng: number) => {
      if (!process.env.API_KEY) return;
      setIsLoadingTrack(true);
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: "Find the single nearest professional motorsport race track suitable for full-size race cars. Strictly EXCLUDE go-kart tracks, family fun centers (like Bob-O's), and amusement parks. Calculate the driving distance.",
              config: {
                  tools: [{ googleMaps: {} }],
                  toolConfig: {
                      retrievalConfig: {
                          latLng: { latitude: lat, longitude: lng }
                      }
                  }
              }
          });

          const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
          const text = response.text || "";
          
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
              name: MOCK_TRACKS[0].name,
              distance: "Unknown",
              uri: ""
          });
      } finally {
          setIsLoadingTrack(false);
      }
  };

  useEffect(() => {
    if (!inGeofence) return;
    
    const interval = setInterval(() => {
        if (simulatedTrack) {
            setCurrentSpeed(prev => {
                const change = Math.floor(Math.random() * 5) - 2;
                return Math.max(0, Math.min(220, prev + change));
            });
            setRpm(prev => {
                 const change = Math.floor(Math.random() * 200) - 100;
                 return Math.max(1000, Math.min(8000, prev + change));
            });
        }
    }, 100);

    return () => clearInterval(interval);
  }, [inGeofence, simulatedTrack]);

  const toggleSimulation = () => {
      if (inGeofence) {
          setInGeofence(false);
          setSimulatedTrack(null);
          setCurrentSpeed(0);
          setRpm(1000);
      } else {
          setInGeofence(true);
          setSimulatedTrack(nearestTrack?.name || MOCK_TRACKS[0].name);
          setCurrentSpeed(85);
          setRpm(4500);
      }
  };

  const handleAdminOverride = () => {
      setInGeofence(true);
      setSimulatedTrack("Admin Override");
      setCurrentSpeed(0);
      setRpm(1000);
  };

  const handleNavigate = () => {
      if (nearestTrack?.uri) {
          window.open(nearestTrack.uri, '_blank');
      } else if (nearestTrack?.name) {
          window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nearestTrack.name)}`, '_blank');
      }
  };

  const handleSaveCustomRoute = () => {
      setInGeofence(true);
      setSimulatedTrack("Custom Route 01");
      setIsCreatorMode(false);
      setRoutePoints([]);
  };

  // --- Views ---

  if (isCreatorMode) {
      return (
          <div className="h-full relative bg-gray-900 flex flex-col">
              <div ref={creatorMapRef} className="absolute inset-0 z-0" />
              
              <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-start pointer-events-none">
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

              <div className="absolute bottom-4 left-4 right-4 z-10 space-y-2 pointer-events-none">
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

  if (!inGeofence) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="w-24 h-24 rounded-full bg-octane-danger/10 flex items-center justify-center border-2 border-octane-danger">
          <Lock className="w-10 h-10 text-octane-danger" />
        </div>
        <div>
          <h2 className="text-3xl font-display font-bold text-white mb-2">Track Mode Locked</h2>
          <p className="text-gray-400 max-w-sm mx-auto">
            Geofencing active. Track features are disabled on public roads. Visit a recognized circuit to unlock high-speed telemetry.
          </p>
        </div>

        {/* Real Location Data */}
        <div className="w-full max-w-xs space-y-2">
            <div className="bg-octane-dark p-3 rounded-xl border border-white/5 flex flex-col gap-2">
                 <h3 className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5">
                    <Crosshair className="w-3.5 h-3.5 text-octane-accent" /> Actual Location
                 </h3>
                 {userLocation ? (
                     <div className="flex justify-between items-center text-xs font-mono text-white">
                         <span>LAT: {userLocation.lat.toFixed(5)}</span>
                         <span className="text-gray-600">|</span>
                         <span>LNG: {userLocation.lng.toFixed(5)}</span>
                     </div>
                 ) : (
                     <div className="text-octane-danger text-xs font-bold">{gpsError || "Signal Lost"}</div>
                 )}
            </div>

            {/* Dynamic Nearest Track Card */}
            <div className="bg-octane-dark p-4 rounded-xl border border-white/5 relative overflow-hidden">
                <h3 className="text-sm font-mono text-gray-500 uppercase mb-3 flex justify-between items-center">
                    Nearest Circuit (Google Maps)
                    {isLoadingTrack && <RefreshCw className="w-3 h-3 animate-spin" />}
                </h3>
                
                {isLoadingTrack ? (
                    <div className="h-10 animate-pulse bg-white/5 rounded"></div>
                ) : nearestTrack ? (
                    <div>
                        <div className="flex justify-between items-start mb-2">
                             <span className="text-white font-bold text-lg leading-tight">{nearestTrack.name}</span>
                             <span className="text-octane-accent text-sm font-mono whitespace-nowrap ml-2">
                                {nearestTrack.distance}
                             </span>
                        </div>
                        <button 
                            onClick={handleNavigate}
                            className="w-full mt-2 py-2 bg-blue-600/20 text-blue-400 border border-blue-600/50 rounded-lg text-xs font-bold hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-2"
                        >
                            <Navigation className="w-3 h-3" /> Navigate to Track
                        </button>
                    </div>
                ) : (
                    <div className="text-gray-500 text-sm italic">Track data unavailable</div>
                )}
            </div>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs mt-4">
            <button 
                onClick={() => setIsCreatorMode(true)}
                className="w-full px-4 py-3 bg-white/5 text-white rounded-lg hover:bg-white/10 transition-colors font-bold border border-white/10 flex items-center justify-center gap-2"
            >
                <PenTool className="w-4 h-4 text-octane-accent" /> Design Custom Route
            </button>

            <button 
                onClick={toggleSimulation}
                className="w-full px-4 py-3 bg-gray-800 text-xs text-gray-400 rounded-lg hover:bg-gray-700 hover:text-white transition-colors font-medium border border-white/5"
            >
                [DEMO] Simulate Arriving at {nearestTrack?.name || 'Track'}
            </button>
            
            <button 
                onClick={handleAdminOverride}
                className="w-full px-4 py-2 border border-red-500/30 text-red-500/50 text-[10px] rounded-lg hover:text-red-400 hover:border-red-500/60 hover:bg-red-500/5 transition-all uppercase font-mono tracking-widest flex items-center justify-center gap-2 group"
            >
                <ShieldAlert className="w-3 h-3 group-hover:animate-pulse" /> Admin Override
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.05)_1px,transparent_1px)] bg-[size:40px_40px]"></div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
        {/* RPM Bar */}
        <div className="w-full max-w-md px-6 mb-8">
            <div className="flex justify-between text-xs font-mono text-gray-400 mb-1">
                <span>0</span>
                <span>4</span>
                <span className="text-octane-danger">8</span>
            </div>
            <div className="h-4 bg-gray-800 rounded-full overflow-hidden flex">
                <div 
                    className="h-full bg-gradient-to-r from-octane-success via-octane-accent to-octane-danger transition-all duration-100 ease-linear"
                    style={{ width: `${(rpm / 8000) * 100}%` }}
                ></div>
            </div>
            <div className="text-center mt-2 font-mono text-xl text-octane-accent">{rpm} RPM</div>
        </div>

        {/* Speedometer */}
        <div className="relative w-64 h-64 flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-octane-accent rounded-full border-t-transparent border-l-transparent rotate-45"></div>
            <div className="flex flex-col items-center">
                <span className="text-8xl font-display font-black text-white tracking-tighter tabular-nums">
                    {currentSpeed}
                </span>
                <span className="text-xl text-gray-400 font-bold uppercase tracking-widest mt-2">MPH</span>
            </div>
        </div>

        {/* Live Data Grid */}
        <div className="grid grid-cols-2 gap-4 mt-12 w-full max-w-sm px-4">
            <div className="bg-octane-dark/80 p-4 rounded-xl border border-white/10">
                <div className="text-xs text-gray-500 uppercase mb-1">G-Force (Lat)</div>
                <div className="text-2xl font-mono text-white">1.2 G</div>
            </div>
            <div className="bg-octane-dark/80 p-4 rounded-xl border border-white/10">
                <div className="text-xs text-gray-500 uppercase mb-1">Lap Time</div>
                <div className="text-2xl font-mono text-octane-success">1:42.05</div>
            </div>
        </div>

        <div className="absolute top-4 left-0 right-0 flex justify-center">
            <div className={`px-4 py-1 rounded-full text-xs font-bold border flex items-center gap-2 ${simulatedTrack === 'Admin Override' ? 'bg-red-500/20 text-red-500 border-red-500/50' : 'bg-octane-success/20 text-octane-success border-octane-success/50'}`}>
                {simulatedTrack === 'Admin Override' ? <ShieldAlert className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                <span>{simulatedTrack === 'Admin Override' ? 'DEV OVERRIDE ACTIVE' : `UNLOCKED: ${simulatedTrack}`}</span>
            </div>
        </div>
      </div>
       <button 
            onClick={() => setInGeofence(false)}
            className="absolute bottom-4 right-4 px-2 py-1 bg-gray-800 text-[10px] text-gray-500 rounded z-20 hover:text-white"
        >
            Exit {simulatedTrack === 'Admin Override' ? 'Override' : 'Sim'}
        </button>
    </div>
  );
};
