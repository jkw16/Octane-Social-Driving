import React, { useEffect, useState, useRef } from 'react';
import { Mic, Activity, Radio } from 'lucide-react';
import { GeminiLiveService } from '../services/liveService';
import { supabase } from '../supabase/client';
import { ProxyChat } from './ProxyChat';
import { UserProfile } from '../types';

const RELAY_URL = import.meta.env.VITE_VOICE_RELAY_URL;
const DEV_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export const VoiceChat: React.FC<{ user: UserProfile }> = ({ user }) => {
    // --- Crew Comms (Gemini crew chief) ---
    const [isActive, setIsActive] = useState(false);
    const [volume, setVolume] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const serviceRef = useRef<GeminiLiveService | null>(null);

    useEffect(() => {
        serviceRef.current = new GeminiLiveService({ relayUrl: RELAY_URL || undefined, apiKey: DEV_KEY || undefined });
        return () => { serviceRef.current?.disconnect().catch(() => {}); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleCrew = async () => {
        if (busy) return;
        if (isActive) { await serviceRef.current?.disconnect(); setIsActive(false); setVolume(0); return; }
        setError(null); setBusy(true);
        try {
            const common = {
                onOpen: () => setIsActive(true),
                onClose: () => setIsActive(false),
                onError: (e: unknown) => { console.error(e); setError('Connection failed'); setIsActive(false); },
                onVolumeChange: (v: number) => setVolume(v),
            };
            if (RELAY_URL) {
                if (!supabase) { setError('Cloud sync not configured'); return; }
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) { setError('Sign in to use voice'); return; }
                await serviceRef.current?.connect({ ...common, relayUrl: RELAY_URL, accessToken: session.access_token });
            } else if (DEV_KEY) {
                await serviceRef.current?.connect({ ...common, apiKey: DEV_KEY });
            } else {
                setError('Voice not configured');
            }
        } finally { setBusy(false); }
    };

    return (
        <div className="h-full overflow-y-auto no-scrollbar p-4 pb-24 space-y-4">
            <header className="flex items-center gap-2 shrink-0">
                <Radio className="w-5 h-5 text-octane-accent" />
                <h1 className="font-display font-bold text-xl text-white">Voice</h1>
            </header>

            {/* Crew Comms — AI crew chief */}
            <div className="bg-octane-dark/80 backdrop-blur rounded-2xl p-4 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Radio className={`w-5 h-5 ${isActive ? 'text-octane-success animate-pulse' : 'text-gray-500'}`} />
                        <h3 className="font-display font-bold text-white">Crew Comms</h3>
                    </div>
                    {isActive && <span className="text-xs text-octane-accent font-mono uppercase px-2 py-0.5 bg-octane-accent/10 rounded">Live</span>}
                </div>
                <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                    Talk to Octane, your AI crew chief. Tap to open the channel.
                </p>
                <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                        {isActive && (
                            <>
                                <span className="absolute inset-0 bg-octane-accent/20 rounded-full animate-ping" style={{ transform: `scale(${1 + volume / 50})` }} />
                                <span className="absolute inset-0 bg-octane-accent/30 rounded-full blur-xl" style={{ transform: `scale(${1 + volume / 30})` }} />
                            </>
                        )}
                        <button
                            onClick={toggleCrew}
                            disabled={busy}
                            className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 border-4 active:scale-95 ${isActive ? 'bg-octane-black border-octane-accent' : 'bg-octane-dark border-gray-600 hover:border-white disabled:opacity-50'}`}
                        >
                            {isActive ? <Activity className="w-7 h-7 text-octane-accent" /> : <Mic className="w-7 h-7 text-gray-400" />}
                        </button>
                    </div>
                    <p className="text-xs text-center">
                        {busy ? 'Connecting…' :
                         error ? <span className="text-octane-danger">{error}</span> :
                         isActive ? 'Listening… talk about the road, cars, or stats' :
                         'Tap to open the channel'}
                    </p>
                </div>
            </div>

            {/* Proxy Chat — open-mic with nearby drivers */}
            <ProxyChat user={user} />
        </div>
    );
};