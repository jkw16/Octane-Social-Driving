import React, { useEffect, useState, useRef } from 'react';
import { Mic, MicOff, Radio, Activity } from 'lucide-react';
import { GeminiLiveService } from '../services/liveService';

export const LiveVoice: React.FC = () => {
    const [isActive, setIsActive] = useState(false);
    const [volume, setVolume] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const serviceRef = useRef<GeminiLiveService | null>(null);

    useEffect(() => {
        // Initialize service only once
        if (!serviceRef.current && process.env.API_KEY) {
            serviceRef.current = new GeminiLiveService(process.env.API_KEY);
        }
        
        return () => {
            if (isActive) {
                serviceRef.current?.disconnect();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleConnection = async () => {
        if (!process.env.API_KEY) {
            setError("API Key missing");
            return;
        }

        if (isActive) {
            await serviceRef.current?.disconnect();
            setIsActive(false);
            setVolume(0);
        } else {
            setError(null);
            await serviceRef.current?.connect({
                apiKey: process.env.API_KEY,
                onOpen: () => setIsActive(true),
                onClose: () => setIsActive(false),
                onError: (e) => {
                    console.error(e);
                    setError("Connection failed");
                    setIsActive(false);
                },
                onVolumeChange: (v) => setVolume(v)
            });
        }
    };

    return (
        <div className="bg-octane-dark/80 backdrop-blur-md rounded-2xl p-6 border border-white/10 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Radio className={`w-5 h-5 ${isActive ? 'text-octane-success animate-pulse' : 'text-gray-500'}`} />
                    <h3 className="font-display font-bold text-lg text-white">Crew Comms</h3>
                </div>
                {isActive && <span className="text-xs text-octane-accent font-mono uppercase px-2 py-1 bg-octane-accent/10 rounded">Live</span>}
            </div>

            <div className="flex flex-col items-center justify-center py-6 gap-4">
                 {/* Visualizer Circle */}
                 <div className="relative">
                     {isActive && (
                         <>
                             <div className="absolute inset-0 bg-octane-accent/20 rounded-full animate-ping" style={{ transform: `scale(${1 + volume/50})` }}></div>
                             <div className="absolute inset-0 bg-octane-accent/30 rounded-full blur-xl" style={{ transform: `scale(${1 + volume/30})` }}></div>
                         </>
                     )}
                     <button 
                        onClick={toggleConnection}
                        className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 border-4 ${isActive ? 'bg-octane-black border-octane-accent' : 'bg-octane-dark border-gray-600 hover:border-white'}`}
                     >
                         {isActive ? <Activity className="w-8 h-8 text-octane-accent" /> : <Mic className="w-8 h-8 text-gray-400" />}
                     </button>
                 </div>

                 <p className="text-sm text-gray-400 text-center max-w-[200px]">
                     {error ? <span className="text-octane-danger">{error}</span> : 
                      isActive ? "Listening... (Talk about the road, cars, or stats)" : "Tap to open channel"}
                 </p>
            </div>
            
            {/* Fake Crew List */}
            <div className="mt-4 pt-4 border-t border-white/5">
                <p className="text-xs font-mono text-gray-500 mb-2 uppercase tracking-wider">Online Crew</p>
                <div className="flex gap-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="w-8 h-8 rounded-full bg-gray-700 border-2 border-octane-black relative">
                            <img src={`https://picsum.photos/32/32?random=${i+10}`} alt="User" className="w-full h-full rounded-full opacity-60 grayscale" />
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-gray-500 rounded-full border border-octane-black"></div>
                        </div>
                    ))}
                     <div className="w-8 h-8 rounded-full bg-octane-accent/20 border-2 border-octane-accent flex items-center justify-center text-[10px] text-octane-accent font-bold">
                        AI
                    </div>
                </div>
            </div>
        </div>
    );
};
