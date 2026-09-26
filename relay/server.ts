// Voice relay for Octane — Deno server (Render).
//
// Two modes over WebSocket, both require a Supabase JWT (?token=):
//   GET /ws   — Crew Comms: bridges one client <-> Gemini Live (key server-side).
//   GET /prox — Proxy Chat: open-mic voice between drivers in the same ~500 ft
//               geographic "cell". The relay groups connections by cell id and
//               forwards audio to everyone else in the cell.
//   GET /health -> "ok"
//
// Deploy (Render auto-deploys from github.com/jkw16/octane-voice-relay):
//   env: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, PORT (default 8000).

import { GoogleGenAI, LiveServerMessage, Modality } from 'https://esm.sh/@google/genai';

const GEMINI_LIVE_AUDIO_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

const SYSTEM_INSTRUCTION =
  "You are 'Octane', a professional, cool, and slightly edgy racing crew chief. " +
  "You are talking to a driver over a radio. Keep responses concise, encouraging, " +
  "and car-culture focused. Use slang like 'rev matches', 'apex', 'grip', 'send it'. " +
  "Do not be overly polite, be a teammate. If the user is just chilling, talk about " +
  "scenic routes or car mods.";

// --- Proxy Chat room state (in-memory; one Render instance) ---
interface ProxConn { ws: WebSocket; userId: string; cellId: string; name: string; avatar: string; }
const proxConns = new Map<WebSocket, ProxConn>();
const rooms = new Map<string, Set<WebSocket>>();

const safeSend = (ws: WebSocket, obj: unknown) => {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch { /* gone */ }
};

const broadcastPresence = (cellId: string) => {
  const members = rooms.get(cellId);
  if (!members) return;
  const users = [...members].map((ws) => {
    const c = proxConns.get(ws)!;
    return { id: c.userId, name: c.name, avatar: c.avatar };
  });
  for (const ws of members) safeSend(ws, { t: 'presence', users });
};

const joinRoom = (ws: WebSocket, cellId: string) => {
  let set = rooms.get(cellId);
  if (!set) { set = new Set(); rooms.set(cellId, set); }
  set.add(ws);
};

const leaveRoom = (ws: WebSocket) => {
  const conn = proxConns.get(ws);
  if (!conn) return;
  const set = rooms.get(conn.cellId);
  if (set) { set.delete(ws); if (set.size === 0) rooms.delete(conn.cellId); broadcastPresence(conn.cellId); }
};

// Validate a Supabase access token; returns the user id or null.
async function getUserId(token: string): Promise<string | null> {
  if (!SUPABASE_URL || !ANON_KEY || !token) return null;
  try {
    const me = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!me.ok) return null;
    const u = await me.json();
    return u?.id ?? null;
  } catch {
    return null;
  }
}

Deno.serve({ port: Number(Deno.env.get('PORT') ?? 8000) }, async (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname === '/health') return new Response('ok');
  if (url.pathname !== '/ws' && url.pathname !== '/prox') return new Response('Not found', { status: 404 });

  const token = url.searchParams.get('token') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return new Response('Unauthorized', { status: 401 });

  const { socket, response } = Deno.upgradeWebSocket(req);

  if (url.pathname === '/ws') {
    // ---- Crew Comms (Gemini Live) ----
    let sessionPromise: Promise<any> | null = null;
    let closed = false;
    const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

    socket.onopen = async () => {
      const uid = await getUserId(token);
      if (!uid) { safeSend(socket, { t: 'error', m: 'unauthorized' }); socket.close(1008, 'unauthorized'); closed = true; return; }
      sessionPromise = ai.live.connect({
        model: GEMINI_LIVE_AUDIO_MODEL,
        callbacks: {
          onmessage: (msg: LiveServerMessage) => {
            const d = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (d && !closed) safeSend(socket, { t: 'audio', d });
          },
          onerror: (e: unknown) => safeSend(socket, { t: 'error', m: String(e) }),
          onclose: () => { closed = true; try { socket.close(); } catch { /* closed */ } },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });
      try { await sessionPromise; } catch (e) { safeSend(socket, { t: 'error', m: String(e) }); socket.close(1011, 'gemini connect failed'); closed = true; }
    };

    socket.onmessage = async (e: MessageEvent) => {
      let msg: any;
      try { msg = JSON.parse(typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data as ArrayBuffer)); } catch { return; }
      if (!sessionPromise) return;
      try {
        const session = await sessionPromise;
        if (msg.t === 'audio' && msg.d) await session.sendRealtimeInput({ media: { data: msg.d, mimeType: 'audio/pcm;rate=16000' } });
        else if (msg.t === 'stop') await session?.close?.();
      } catch { /* mid-stream */ }
    };
    const teardown = async () => { if (closed) return; closed = true; try { const s = await sessionPromise; await s?.close?.(); } catch { /* ignore */ } };
    socket.onclose = teardown;
    socket.onerror = teardown;
    return response;
  }

  // ---- Proxy Chat (proximity rooms) ----
  socket.onopen = async () => {
    const uid = await getUserId(token);
    if (!uid) { safeSend(socket, { t: 'error', m: 'unauthorized' }); socket.close(1008, 'unauthorized'); return; }
    // Wait for the client's join with its cell + profile; store a placeholder so
    // onclose can clean up if it disconnects before joining.
    proxConns.set(socket, { ws: socket, userId: uid, cellId: '', name: '', avatar: '' });
  };

  socket.onmessage = (e: MessageEvent) => {
    let msg: any;
    try { msg = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch { return; }
    const conn = proxConns.get(socket);
    if (!conn) return;

    if (msg.t === 'join' && msg.cell) {
      leaveRoom(socket); // in case of re-join
      conn.cellId = String(msg.cell);
      conn.name = String(msg.name ?? 'Driver');
      conn.avatar = String(msg.avatar ?? '');
      joinRoom(socket, conn.cellId);
      broadcastPresence(conn.cellId);
    } else if (msg.t === 'move' && msg.cell) {
      leaveRoom(socket);
      conn.cellId = String(msg.cell);
      joinRoom(socket, conn.cellId);
      broadcastPresence(conn.cellId);
    } else if (msg.t === 'audio' && msg.d) {
      const set = rooms.get(conn.cellId);
      if (!set) return;
      for (const peer of set) {
        if (peer === socket) continue;
        safeSend(peer, { t: 'audio', d: msg.d, from: conn.userId });
      }
    } else if (msg.t === 'leave') {
      leaveRoom(socket);
      conn.cellId = '';
    }
  };

  socket.onclose = () => { leaveRoom(socket); proxConns.delete(socket); };
  socket.onerror = () => { leaveRoom(socket); proxConns.delete(socket); };
  return response;
});