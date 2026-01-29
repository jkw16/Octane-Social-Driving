import React, { useState, useMemo } from 'react';
import { Map, Users, Clock, Filter, ArrowUpDown, Calendar, MapPin, Sparkles, ExternalLink, Loader2 } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { MOCK_MEETUPS } from '../constants';
import { Meetup } from '../types';

export const Meetups: React.FC = () => {
    const [filterType, setFilterType] = useState<'All' | 'Chill' | 'Race' | 'Show'>('All');
    const [sortBy, setSortBy] = useState<'Time' | 'Distance'>('Time');
    
    // AI Search State
    const [isSearching, setIsSearching] = useState(false);
    const [aiResults, setAiResults] = useState<{
        summary: string;
        sources: { title: string; uri: string }[];
    } | null>(null);

    // Mock User Location (Downtown LA) for distance calculation
    const userLat = 34.0522;
    const userLng = -118.2437;

    const getDistance = (lat: number, lng: number) => {
        const R = 6371; // km
        const dLat = (lat - userLat) * Math.PI / 180;
        const dLon = (lng - userLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(userLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const d = R * c * 0.621371; // convert to miles
        return d;
    };

    const handleScoutEvents = async () => {
        if (!process.env.API_KEY) return;
        setIsSearching(true);
        setAiResults(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: "Find 3 interesting car meets, automotive shows, or motorsport events happening in Los Angeles this week. Provide a concise summary of the events (Name, Date, Location) as a bulleted list.",
                config: {
                    tools: [{ googleSearch: {} }],
                }
            });

            const text = response.text || "No events found.";
            const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            
            // Extract sources from chunks
            const sources = chunks
                .filter((c: any) => c.web?.uri && c.web?.title)
                .map((c: any) => ({ title: c.web.title, uri: c.web.uri }));

            setAiResults({
                summary: text,
                sources: sources
            });

        } catch (e) {
            console.error("Search Grounding Error:", e);
            setAiResults({
                summary: "Failed to scout live events. Please try again.",
                sources: []
            });
        } finally {
            setIsSearching(false);
        }
    };

    const filteredAndSortedMeetups = useMemo(() => {
        let result = [...MOCK_MEETUPS];

        // Filter
        if (filterType !== 'All') {
            result = result.filter(m => m.type === filterType);
        }

        // Sort
        result.sort((a, b) => {
            if (sortBy === 'Distance') {
                const distA = getDistance(a.lat, a.lng);
                const distB = getDistance(b.lat, b.lng);
                return distA - distB;
            } else {
                return a.id.localeCompare(b.id);
            }
        });

        return result;
    }, [filterType, sortBy]);

    return (
        <div className="p-4 space-y-4 pb-24">
            <div className="flex flex-col gap-4">
                <header className="flex justify-between items-center">
                     <div>
                         <h2 className="text-2xl font-display font-bold text-white">Car Meets</h2>
                         <p className="text-gray-400 text-xs">Local gatherings & events</p>
                     </div>
                     <button 
                        onClick={() => setSortBy(prev => prev === 'Time' ? 'Distance' : 'Time')}
                        className="flex items-center gap-1.5 text-xs font-bold text-octane-accent bg-octane-accent/10 px-3 py-1.5 rounded-lg hover:bg-octane-accent/20 transition-colors"
                     >
                        <ArrowUpDown className="w-3 h-3" />
                        {sortBy === 'Time' ? 'Soonest' : 'Nearest'}
                     </button>
                </header>
                
                {/* AI Search Section */}
                <div className="bg-gradient-to-r from-blue-900/40 to-octane-dark rounded-xl border border-blue-500/30 p-4">
                    <div className="flex justify-between items-start mb-3">
                         <div className="flex items-center gap-2">
                             <Sparkles className="w-4 h-4 text-blue-400" />
                             <h3 className="text-sm font-bold text-white">Live Event Scout</h3>
                         </div>
                         <button 
                             onClick={handleScoutEvents}
                             disabled={isSearching}
                             className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                         >
                             {isSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : <SearchIcon />}
                             {isSearching ? 'Scouting...' : 'Search Online'}
                         </button>
                    </div>
                    
                    {aiResults && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="bg-black/30 rounded-lg p-3 text-sm text-gray-200 leading-relaxed mb-3 whitespace-pre-wrap font-sans">
                                {aiResults.summary}
                            </div>
                            {aiResults.sources.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {aiResults.sources.map((source, idx) => (
                                        <a 
                                            key={idx} 
                                            href={source.uri} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded px-2 py-1 text-[10px] text-blue-300 transition-colors truncate max-w-[150px]"
                                        >
                                            <ExternalLink className="w-2.5 h-2.5" />
                                            <span className="truncate">{source.title}</span>
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Filters */}
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {(['All', 'Chill', 'Race', 'Show'] as const).map((type) => (
                        <button
                            key={type}
                            onClick={() => setFilterType(type)}
                            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                                filterType === type 
                                ? 'bg-white text-octane-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
                                : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'
                            }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {filteredAndSortedMeetups.map(meet => {
                    const distance = getDistance(meet.lat, meet.lng).toFixed(1);
                    return (
                        <div key={meet.id} className="bg-octane-dark rounded-xl overflow-hidden border border-white/5 group hover:border-white/20 transition-colors">
                            <div className="h-28 bg-gray-800 relative">
                                <img src={`https://picsum.photos/400/200?random=${meet.id}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-500" alt="map" />
                                <div className="absolute top-2 right-2 flex gap-2">
                                     <div className="bg-black/60 px-2 py-1 rounded text-[10px] font-bold text-white flex items-center gap-1">
                                        <Users className="w-3 h-3" /> {meet.attendees}
                                     </div>
                                </div>
                            </div>
                            <div className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h3 className="font-bold text-white text-lg">{meet.title}</h3>
                                        <p className="text-gray-400 text-xs flex items-center gap-1">
                                            <MapPin className="w-3 h-3" /> {meet.location}
                                        </p>
                                    </div>
                                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                        meet.type === 'Race' ? 'bg-red-500/20 text-red-400 border border-red-500/50' :
                                        meet.type === 'Chill' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' :
                                        'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                                    }`}>
                                        {meet.type}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between mt-3">
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Clock className="w-3 h-3" />
                                        <span>{meet.time}</span>
                                    </div>
                                    <div className="text-octane-accent font-mono text-xs font-bold">
                                        {distance} mi
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 mt-2 line-clamp-1 border-t border-white/5 pt-2">
                                    {meet.description}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// Helper Icon for search button
const SearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
);