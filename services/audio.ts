// Shared audio helpers for the voice features: mic capture → 16 kHz mono PCM
// (base64), PCM decode, and immediate playback. Used by Crew Comms
// (services/liveService.ts) and Proxy Chat (components/ProxyChat.tsx).

const floatToInt16 = (input: Float32Array): Int16Array => {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

export const encodePcm16 = (input: Float32Array): string => {
  const bytes = new Uint8Array(floatToInt16(input).buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

// Decode 16-bit PCM (base64) to Float32 samples.
export const decodePcm16 = (base64: string): Float32Array => {
  const int16 = new Int16Array(base64ToArrayBuffer(base64));
  const f = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) f[i] = int16[i] / 32768;
  return f;
};

export interface MicHandle { stop: () => Promise<void>; }

// getUserMedia + 16 kHz ScriptProcessor. Calls onChunk with base64 PCM frames
// and onVolume with an RMS level (0..~100). Returns a handle whose stop() tears
// down the mic + AudioContext.
export async function startMic(
  onChunk: (base64: string) => void,
  onVolume?: (v: number) => void,
): Promise<MicHandle> {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e: AudioProcessingEvent) => {
    const input = e.inputBuffer.getChannelData(0);
    if (onVolume) {
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      onVolume(Math.sqrt(sum / input.length) * 100);
    }
    onChunk(encodePcm16(input));
  };
  source.connect(processor);
  processor.connect(ctx.destination);
  return {
    stop: async () => {
      stream.getTracks().forEach((t) => t.stop());
      try { processor.disconnect(); source.disconnect(); } catch { /* already gone */ }
      try { await ctx.close(); } catch { /* already closed */ }
    },
  };
}

// Play a PCM16 chunk on an AudioContext immediately (start at currentTime so
// multiple concurrent sources from different speakers mix — used for proximity
// multi-speaker audio). sampleRate is the PCM's rate (24 kHz for Gemini, 16 kHz
// for proxy mic audio); WebAudio resamples to the context rate on playback.
export function playPcmChunk(ctx: AudioContext, base64: string, sampleRate: number): void {
  const data = decodePcm16(base64);
  const buffer = ctx.createBuffer(1, data.length, sampleRate);
  buffer.copyToChannel(data, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  try { src.start(ctx.currentTime); } catch { /* timing race */ }
}