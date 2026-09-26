import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // Relative asset paths so the built files work from Capacitor's local
      // origin (capacitor://localhost or https://localhost) as well as any
      // static host used for the PWA path. Without this Vite emits absolute
      // "/assets/..." paths that break under a non-root origin.
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Supabase project URL + anon public key, exposed to the client via
        // import.meta.env (Vite reliably replaces these tokens; the earlier
        // process.env.* defines did not get replaced). The anon key is designed
        // to be public — RLS + the submit-drive Edge Function are the real
        // guardrails, not key secrecy.
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.SUPABASE_URL ?? ''),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY ?? ''),
        // Gemini key: DEV-only (so the Live Voice crew chief works locally).
        // Production builds get '' — the key never ships in the public bundle.
        // All other AI calls go through the gemini-proxy Edge Function.
        'import.meta.env.VITE_GEMINI_API_KEY': mode === 'development' ? JSON.stringify(env.GEMINI_API_KEY ?? '') : JSON.stringify(''),
        // Voice relay URL (Deno Deploy) for the live 2-way voice tab. The relay
        // holds the Gemini key; the client only needs this URL + a Supabase JWT.
        'import.meta.env.VITE_VOICE_RELAY_URL': JSON.stringify(env.VOICE_RELAY_URL ?? ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});