import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { GEMINI_LIVE_AUDIO_MODEL } from '../constants';
import { startMic, decodePcm16, MicHandle } from './audio';

interface LiveConfig {
  // Relay (production): the voice relay URL + a Supabase access token. The key
  // lives server-side in the relay; the client never sees it.
  relayUrl?: string;
  accessToken?: string;
  // Direct (dev fallback only): a client-side Gemini key. Production builds
  // have no key, so this path only runs during local development.
  apiKey?: string;
  onOpen?: () => void;
  onClose?: () => void;
  onAudioData?: (data: AudioBuffer) => void;
  onError?: (error: Error | unknown) => void;
  onVolumeChange?: (volume: number) => void;
}

const SYSTEM_INSTRUCTION =
  "You are 'Octane', a professional, cool, and slightly edgy racing crew chief. " +
  "You are talking to a driver over a radio. Keep responses concise, encouraging, " +
  "and car-culture focused. Use slang like 'rev matches', 'apex', 'grip', 'send it'. " +
  "Do not be overly polite, be a teammate. If the user is just chilling, talk about " +
  "scenic routes or car mods.";

export class GeminiLiveService {
  private relayUrl?: string;
  private apiKey?: string;
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private isConnected = false;
  private mic: MicHandle | null = null;
  private ws: WebSocket | null = null;
  private sessionPromise: Promise<any> | null = null;

  constructor(opts: { relayUrl?: string; apiKey?: string } = {}) {
    this.relayUrl = opts.relayUrl;
    this.apiKey = opts.apiKey;
  }

  async connect(config: LiveConfig) {
    if (this.isConnected) return;

    const useRelay = !!(this.relayUrl && config.accessToken);
    const useDirect = !!(this.apiKey);
    if (!useRelay && !useDirect) {
      config.onError?.(new Error('Voice not configured — need relay URL + sign-in, or a dev API key.'));
      return;
    }

    try {
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const startMicCapture = () => {
        startMic((b64) => this.sendAudio(b64), config.onVolumeChange)
          .then((h) => { this.mic = h; })
          .catch((e) => config.onError?.(e));
      };

      if (useRelay) {
        const wsUrl =
          this.relayUrl!.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:') +
          (this.relayUrl!.includes('?') ? '&' : '?') +
          'token=' + encodeURIComponent(config.accessToken!);
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        ws.onopen = () => {
          this.isConnected = true;
          startMicCapture();
          config.onOpen?.();
        };
        ws.onmessage = async (ev: MessageEvent) => {
          let msg: any;
          try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
          if (!msg) return;
          if (msg.t === 'audio' && msg.d) this.playIncoming(msg.d, config);
          else if (msg.t === 'error') config.onError?.(new Error(msg.m || 'relay error'));
        };
        ws.onclose = () => { this.isConnected = false; config.onClose?.(); };
        ws.onerror = (e) => config.onError?.(e);
      } else {
        // Direct mode — dev fallback. Mirrors the original client Gemini Live path.
        const client = new GoogleGenAI({ apiKey: this.apiKey! });
        const sessionPromise = client.live.connect({
          model: GEMINI_LIVE_AUDIO_MODEL,
          callbacks: {
            onopen: () => {
              this.isConnected = true;
              startMicCapture();
              config.onOpen?.();
            },
            onmessage: async (message: LiveServerMessage) => {
              const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (base64Audio) this.playIncoming(base64Audio, config);
            },
            onclose: () => { this.isConnected = false; config.onClose?.(); },
            onerror: (err) => config.onError?.(err),
          },
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
            systemInstruction: SYSTEM_INSTRUCTION,
          },
        });
        this.sessionPromise = sessionPromise;
      }
    } catch (error) {
      config.onError?.(error);
    }
  }

  // Queue incoming audio back-to-back (single continuous stream — Crew Comms).
  private playIncoming(base64: string, config: LiveConfig) {
    if (!this.outputAudioContext) return;
    this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
    const data = decodePcm16(base64);
    const buffer = this.outputAudioContext.createBuffer(1, data.length, 24000);
    buffer.copyToChannel(data, 0);
    config.onAudioData?.(buffer);
    const src = this.outputAudioContext.createBufferSource();
    src.buffer = buffer;
    src.connect(this.outputAudioContext.destination);
    src.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
  }

  private sendAudio(base64: string) {
    if (this.ws) {
      try { this.ws.send(JSON.stringify({ t: 'audio', d: base64 })); } catch { /* socket closed */ }
    } else if (this.sessionPromise) {
      this.sessionPromise.then((session) => session?.sendRealtimeInput?.({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } }));
    }
  }

  async disconnect() {
    if (!this.isConnected && !this.sessionPromise && !this.ws) return;
    this.isConnected = false;

    try { await this.mic?.stop(); } catch { /* ignore */ }
    this.mic = null;
    try { await this.outputAudioContext?.close(); } catch { /* ignore */ }

    if (this.ws) {
      try { this.ws.send(JSON.stringify({ t: 'stop' })); } catch { /* ignore */ }
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    const pending = this.sessionPromise;
    this.sessionPromise = null;
    if (pending) {
      try { const session = await pending; await session?.close?.(); } catch { /* ignore */ }
    }

    this.outputAudioContext = null;
  }
}