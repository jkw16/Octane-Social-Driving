import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase URL + anon key are exposed to the client via Vite's import.meta.env
// (see vite.config.ts `define` + vite-env.d.ts). Both come from .env.local.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Whether a Supabase project is configured for this build. UI that depends on
// the backend (leaderboard, cloud auth, live stats) checks this and degrades
// gracefully to local/empty state when false, so the app still boots before
// the owner has wired up a project.
export const isSupabaseConfigured = Boolean(url && anonKey);

// Lazily-held singleton. `null` when unconfigured — every consumer must
// null-check `supabase` before use.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;