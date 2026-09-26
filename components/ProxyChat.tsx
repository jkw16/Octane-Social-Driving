import React, { useEffect, useRef, useState } from 'react';
import { Mic, Radio, MapPin } from 'lucide-react';
import { supabase } from '../supabase/client';
import { startMic, playPcmChunk, MicHandle } from '../services/audio';
import { UserProfile } from '../types';

const RELAY_URL = import.meta.env.VITE_VOICE_RELAY_URL;
const CELL_METERS = 152; // ~500 ft

// Snap a GPS fix to a ~500 ft geographic bucket so nearby drivers hash to the
// same "cell" = same voice room. (Edge effects at boundaries; v1.)
function cellId(lat: number, lng: number): string {
  const latBucket = Math.round(lat / (CELL_METERS / 111320));
  const lngBucket = Math.round(lng / (CELL_METERS / (111320 * Math.cos((lat * Math.PI) / 180))));
  return `${latBucket}:${lngBucket}`;
}

interface ProxUser { id: string; name: string; avatar: string }

interface ProxyChatProps {
  user: UserProfile;
}

export const ProxyChat: React.FC<ProxyChatProps> = ({ user }) => {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  const [nearby, setNearby] = useState<ProxUser[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const micRef = useRef<MicHandle | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const cellRef = useRef<string>('');

  const stop = async () => {
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify({ t: 'leave' })); } catch { /* ignore */ } }
    try { ws?.close(); } catch { /* ignore */ }
    wsRef.current = null;
    try { await micRef.current?.stop(); } catch { /* ignore */ }
    micRef.current = null;
    try { await outCtxRef.current?.close(); } catch { /* ignore */ }
    outCtxRef.current = null;
    cellRef.current = '';
    setActive(false);
    setVolume(0);
    setNearby([]);
  };

  useEffect(() => {
    return () => { void stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (busy || active) return;
    setError(null);
    setBusy(true);
    try {
      if (!supabase || !RELAY_URL) { setError('Voice relay not configured'); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Sign in to use proxy chat'); return; }

      // First GPS fix → initial cell. watchPosition keeps it fresh as the
      // driver moves, sending {t:'move'} when the bucket changes.
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 })
      ).catch(() => null as GeolocationPosition | null);
      if (!pos) { setError('Location permission needed'); return; }
      cellRef.current = cellId(pos.coords.latitude, pos.coords.longitude);

      outCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

      const proxWsUrl =
        RELAY_URL.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:') +
        '/prox?token=' + encodeURIComponent(session.access_token);
      const ws = new WebSocket(proxWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setActive(true);
        ws.send(JSON.stringify({ t: 'join', cell: cellRef.current, name: user.username, avatar: user.avatar }));
        startMic((b64) => { try { ws.send(JSON.stringify({ t: 'audio', d: b64 })); } catch { /* closed */ } }, (v) => setVolume(v))
          .then((h) => { micRef.current = h; })
          .catch((e) => setError(String(e?.message ?? e)));
        watchIdRef.current = navigator.geolocation.watchPosition(
          (p) => {
            const next = cellId(p.coords.latitude, p.coords.longitude);
            if (next !== cellRef.current && ws.readyState === 1) {
              cellRef.current = next;
              ws.send(JSON.stringify({ t: 'move', cell: next }));
            }
          },
          () => { /* ignore movement errors */ },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
      };
      ws.onmessage = (ev: MessageEvent) => {
        let msg: any;
        try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
        if (!msg) return;
        if (msg.t === 'presence' && Array.isArray(msg.users)) setNearby(msg.users as ProxUser[]);
        else if (msg.t === 'audio' && msg.d && outCtxRef.current) playPcmChunk(outCtxRef.current, msg.d, 16000);
        else if (msg.t === 'error') setError(String(msg.m ?? 'relay error'));
      };
      ws.onclose = () => { void stop(); };
      ws.onerror = () => { setError('Connection failed'); };
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => { if (active) void stop(); else void start(); };

  const inRange = nearby.length;

  return (
    <div className="bg-octane-dark/80 backdrop-blur rounded-2xl p-4 border border-white/10">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio className={`w-5 h-5 ${active ? 'text-octane-accent animate-pulse' : 'text-gray-500'}`} />
          <h3 className="font-display font-bold text-white">Proxy Chat</h3>
          {/* Bright-blue ON/OFF indicator. Reuses `active` (mic live + connected) and
              `busy` (connecting). ON => glowing cyan "LIVE" badge with a pulsing dot;
              OFF => muted gray "IDLE" badge so the contrast is obvious at a glance. */}
          <span
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-wider ${
              active
                ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200'
                : busy
                  ? 'bg-cyan-500/5 border-cyan-400/20 text-cyan-400/70'
                  : 'bg-white/5 border-white/10 text-gray-500'
            }`}
            aria-label={active ? 'Proxy chat on' : busy ? 'Proxy chat connecting' : 'Proxy chat off'}
            role="status"
          >
            <span className="relative flex w-2 h-2 items-center justify-center">
              {active && (
                <span className="absolute inline-flex w-full h-full rounded-full bg-cyan-400 animate-ping opacity-70" />
              )}
              <span
                className={`relative inline-flex w-2 h-2 rounded-full ${
                  active ? 'bg-cyan-300' : busy ? 'bg-cyan-500/60 animate-pulse' : 'bg-gray-600'
                }`}
                style={active ? { boxShadow: '0 0 6px 2px rgba(34,211,238,0.75)' } : undefined}
              />
            </span>
            {active ? 'Live' : busy ? 'Linking' : 'Idle'}
          </span>
        </div>
        {active && <span className="text-xs text-octane-accent font-mono uppercase px-2 py-0.5 bg-octane-accent/10 rounded">{inRange} in range</span>}
      </div>

      <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
        Open-mic voice with other drivers within ~500 ft of you. Your mic is live while connected.
      </p>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={toggle}
          disabled={busy}
          className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 border-4 active:scale-95 ${active ? 'bg-octane-black border-octane-accent' : 'bg-octane-dark border-gray-600 hover:border-white disabled:opacity-50'}`}
        >
          {active && (
            <span className="absolute inset-0 rounded-full bg-octane-accent/20 animate-ping" style={{ transform: `scale(${1 + volume / 80})` }} />
          )}
          <Mic className={`relative w-7 h-7 ${active ? 'text-octane-accent' : 'text-gray-400'}`} />
        </button>
        <p className="text-xs text-center">
          {busy ? 'Connecting…' :
           error ? <span className="text-octane-danger">{error}</span> :
           active ? (inRange > 0 ? 'Live — talk to nearby drivers' : 'Mic open — waiting for nearby drivers') :
           'Tap to join nearby drivers'}
        </p>
      </div>

      {active && inRange > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <MapPin className="w-4 h-4 text-gray-500 shrink-0" />
          {nearby.map((u) => (
            <div key={u.id} className="flex flex-col items-center gap-1 shrink-0">
              <img src={u.avatar || 'https://picsum.photos/64'} alt={u.name} className="w-8 h-8 rounded-full object-cover border border-white/10" />
              <span className="text-[9px] text-gray-400 max-w-[60px] truncate">{u.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};