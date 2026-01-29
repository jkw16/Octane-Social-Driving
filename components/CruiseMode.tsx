import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LiveVoice } from './LiveVoice';
import { Navigation, MapPin, Search, ArrowRight, X, Loader2, Map as MapIcon } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

export const CruiseMode: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [speed, setSpeed] = useState(0);
  const [heading, setHeading] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  
  // Route State
  const [destinationInput, setDestinationInput] = useState('');
  const [isRouteActive, setIsRouteActive] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  
  // Smart Search Result
  const [resolvedPlace, setResolvedPlace] = useState<{
      name: string;
      address?: string;
      rating?: number;
      uri?: string;
  } | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Map if not exists
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([34.0522, -118.2437], 15); // Default LA

      // Dark Mode Tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        subdomains: 'abcd',
      }).addTo(map);

      // Custom User Marker
      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: #06b6d4; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px #06b6d4;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      const marker = L.marker([34.0522, -118.2437], { icon }).addTo(map);
      markerRef.current = marker;
      mapInstanceRef.current = map;
    }

    // Geolocation Tracking
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed: gpsSpeed, heading: gpsHeading } = pos.coords;
        const currentSpeed = gpsSpeed ? Math.round(gpsSpeed * 2.23694) : 0; 
        
        setSpeed(currentSpeed);
        setCurrentLocation({ lat: latitude, lng: longitude });
        if (gpsHeading) setHeading(gpsHeading);

        if (mapInstanceRef.current && markerRef.current) {
          const newLatLng = new L.LatLng(latitude, longitude);
          markerRef.current.setLatLng(newLatLng);
          // Only auto-center if we aren't panning manually, but for this simplified view we always center
          mapInstanceRef.current.setView(newLatLng, 18, { animate: true });
        }
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const handleSmartSearch = async () => {
      if (!destinationInput.trim() || !process.env.API_KEY) return;
      
      setIsSearching(true);
      setResolvedPlace(null);

      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Find the specific location for: "${destinationInput}". If it's a generic term like "gas" or "coffee", find the nearest one. Provide the name and address.`,
            config: {
                tools: [{ googleMaps: {} }],
                toolConfig: {
                    retrievalConfig: {
                        latLng: currentLocation ? { latitude: currentLocation.lat, longitude: currentLocation.lng } : undefined
                    }
                }
            }
        });

        const text = response.text || "";
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        
        // Extract data from Grounding Chunks (Priority)
        // Note: The structure of groundingChunks for Maps tool typically contains 'web' or 'maps' properties depending on resolution
        const mapChunk = chunks?.find((c: any) => c.web?.uri && c.web?.title);
        
        let placeName = destinationInput;
        let placeUri = "";
        
        if (mapChunk && mapChunk.web) {
             placeName = mapChunk.web.title || placeName;
             placeUri = mapChunk.web.uri || "";
        } else {
             // Fallback to text parsing if no chunks (unlikely with valid maps result)
             placeName = text.split('\n')[0] || destinationInput;
        }

        setResolvedPlace({
            name: placeName,
            address: "Tap navigate for details", // Simplified for UI
            uri: placeUri
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
      {/* Map Container */}
      <div ref={mapContainerRef} className="absolute inset-0 z-0 opacity-50" />

      {/* Top UI - Search / Route Setter */}
      <div className="relative z-10 p-4 pt-6 space-y-4">
        
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
      </div>

      {/* Bottom Area */}
      <div className="mt-auto relative z-10 p-4 pb-24 space-y-3 pointer-events-none">
          <div className="pointer-events-auto">
             <LiveVoice />
          </div>
          
          <div className="bg-octane-black/80 backdrop-blur p-4 rounded-2xl border border-white/5 flex justify-between items-center">
             <div>
                 <div className="text-[10px] text-gray-500 uppercase">Current Speed</div>
                 <div className="text-2xl font-display font-black text-white">{speed} <span className="text-sm text-gray-500 font-sans">MPH</span></div>
             </div>
             <div>
                 <Navigation className="w-8 h-8 text-gray-600" style={{ transform: `rotate(${heading}deg)` }} />
             </div>
          </div>
      </div>
    </div>
  );
};
