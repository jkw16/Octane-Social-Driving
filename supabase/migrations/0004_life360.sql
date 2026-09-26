-- 0004_life360.sql — Life360 Safety-Score connector schema.
--
-- Lets a signed-in user connect their Life360 account (creds encrypted in
-- Deno with Web Crypto AES-GCM, stored as base64 text here) and import their
-- own trips as drive_events rows tagged source='life360'. The weekly Safety
-- leaderboard is a pure SQL aggregate over drive_events(safety_events,
-- distance_mi), so imported rows join the board automatically — no scoring
-- function changes needed. Dedup by Life360 trip id via external_id.
--
-- Apply with: supabase db push   (pgcrypto already enabled by 0001_init.sql).

-- 1. Tag where a drive event came from, and a stable external id for dedup.
alter table public.drive_events
  add column if not exists source text not null default 'app';
alter table public.drive_events
  add column if not exists external_id text;

-- One row per (user, external_id). Null external_id (in-app GPS sessions)
-- coexist freely; only Life360 trip ids are unique per user.
create unique index if not exists drive_events_user_external_unique
  on public.drive_events (user_id, external_id)
  where external_id is not null;

-- 2. Per-user Life360 connection state on profiles (client-readable via
--    existing owner/public RLS so the Connect card can show status).
alter table public.profiles
  add column if not exists life360_connected boolean not null default false;
alter table public.profiles
  add column if not exists life360_synced_at timestamptz;

-- 3. Encrypted Life360 credentials. RLS denies ALL client access; only the
--    service-role Edge Functions (connect-life360 / sync-life360) read/write,
--    and they bypass RLS. Password is encrypted in Deno (key never reaches DB).
create table if not exists public.life360_credentials (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  email         text not null,
  password_enc  text not null,            -- base64(iv || AES-GCM ciphertext)
  circle_id     text,                     -- the owner's own circle
  member_id     text,                     -- the owner's own member in that circle
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.life360_credentials enable row level security;
-- No policies => anon/authenticated clients can neither read nor write.
-- The Edge Functions use the service-role key, which bypasses RLS.

-- Index for the connect card's "is this user connected?" lookup.
create index if not exists life360_credentials_user_idx
  on public.life360_credentials (user_id);