import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

interface LiveConfig {
  apiKey: string;
  onOpen?: () => void;
  onClose?: () => void;
  onAudioData?: (data: AudioBuffer) => void;
  onError?: (error: Error | unknown) => void;
  onVolumeChange?: (volume: number) => void;
}

export class GeminiLiveService {
  private client: GoogleGenAI;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nextStartTime = 0;
  private isConnected = false;
  private sessionPromise: Promise<any> | null = null; // using any for session type to avoid deep import issues

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async connect(config: LiveConfig) {
    if (this.isConnected) return;

    try {
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = this.client.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            this.isConnected = true;
            this.setupAudioInput(sessionPromise, config.onVolumeChange);
            config.onOpen?.();
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && this.outputAudioContext) {
               // Handle Audio Output
               this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
               const audioBuffer = await this.decodeAudioData(
                 this.base64ToArrayBuffer(base64Audio),
                 this.outputAudioContext,
                 24000,
                 1
               );
               
               // Pass buffer back to UI for visualization
               config.onAudioData?.(audioBuffer);

               const source = this.outputAudioContext.createBufferSource();
               source.buffer = audioBuffer;
               source.connect(this.outputAudioContext.destination);
               source.start(this.nextStartTime);
               this.nextStartTime += audioBuffer.duration;
            }
          },
          onclose: () => {
            this.isConnected = false;
            config.onClose?.();
          },
          onerror: (err) => {
            console.error(err);
            config.onError?.(err);
          }
        },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' }}
            },
            systemInstruction: "You are 'Octane', a professional, cool, and slightly edgy racing crew chief. You are talking to a driver over a radio. Keep responses concise, encouraging, and car-culture focused. Use slang like 'rev matches', 'apex', 'grip', 'send it'. Do not be overly polite, be a teammate. If the user is just chilling, talk about scenic routes or car mods."
        }
      });
      
      this.sessionPromise = sessionPromise;

    } catch (error) {
        config.onError?.(error);
    }
  }

  private setupAudioInput(sessionPromise: Promise<any>, onVolumeChange?: (vol: number) => void) {
    if (!this.inputAudioContext || !this.stream) return;

    this.source = this.inputAudioContext.createMediaStreamSource(this.stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate volume for visualization
        if (onVolumeChange) {
            let sum = 0;
            for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
            const rms = Math.sqrt(sum / inputData.length);
            onVolumeChange(rms * 100); // Scale up
        }

        const pcmBlob = this.createPcmBlob(inputData);
        sessionPromise.then(session => {
            session.sendRealtimeInput({ media: pcmBlob });
        });
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  async disconnect() {
    if (!this.isConnected) return;
    
    // Close context and tracks
    this.stream?.getTracks().forEach(track => track.stop());
    this.processor?.disconnect();
    this.source?.disconnect();
    await this.inputAudioContext?.close();
    await this.outputAudioContext?.close();

    // Reset
    this.stream = null;
    this.processor = null;
    this.source = null;
    this.isConnected = false;
    
    // Note: session.close() not strictly exposed in this pattern easily without storing the resolved session, 
    // but stopping the audio stream effectively ends the interaction from client side.
  }

  private createPcmBlob(data: Float32Array): { data: string, mimeType: string } {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        // Simple float to int16 conversion
        let s = Math.max(-1, Math.min(1, data[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    // Convert buffer to binary string then btoa
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    
    return {
        data: btoa(binary),
        mimeType: 'audio/pcm;rate=16000'
    };
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private async decodeAudioData(arrayBuffer: ArrayBuffer, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
     const dataInt16 = new Int16Array(arrayBuffer);
     const frameCount = dataInt16.length / numChannels;
     const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
     
     for(let channel=0; channel < numChannels; channel++) {
         const channelData = buffer.getChannelData(channel);
         for(let i=0; i<frameCount; i++) {
             channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
         }
     }
     return buffer;
  }
}
