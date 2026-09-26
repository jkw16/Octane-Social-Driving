-- Octane: Social Driving — initial schema, RLS, leaderboard aggregation.
-- Run in the Supabase SQL editor (Dashboard → SQL → New query) after creating
-- the project. Idempotent-ish: uses `if not exists` / `on conflict` where it
-- matters, but re-running will error on some `create trigger`s if they exist.
--
-- Prereqs: enable the `pg_cron` extension (Dashboard → Database → Extensions).
-- `pgcrypto` ships with Supabase (gen_random_uuid) but is declared here too.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- =====================================================================
-- profiles — backs UserProfile (auth user owns the identity)
-- =====================================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique,
  car        text not null default '',
  avatar     text not null default '',
  created_at timestamptz not null default now()
);

-- =====================================================================
-- tracks — public circuit catalog, used for geofence validation
-- =====================================================================
create table if not exists public.tracks (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  location      text not null default '',
  lat           double precision not null,
  lng           double precision not null,
  radius        integer not null,              -- meters
  record_holder text,
  record_speed  integer                         -- mph, used for plausibility bounds
);

-- =====================================================================
-- drive_events — append-only session log; source of truth for all scoring
-- =====================================================================
create table if not exists public.drive_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  track_id      uuid references public.tracks(id) on delete set null,
  started_at    timestamptz not null,
  ended_at      timestamptz,
  distance_mi   numeric not null,
  top_speed_mph integer not null,
  avg_speed_mph integer not null default 0,
  safety_events integer not null default 0,
  witness       jsonb,                          -- sampled GPS points for validation
  created_at    timestamptz not null default now()
);
create index if not exists drive_events_user_started_idx
  on public.drive_events (user_id, started_at);

-- =====================================================================
-- user_stats — live counters for the Dashboard (one row per user)
-- =====================================================================
create table if not exists public.user_stats (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  weekly_mileage numeric not null default 0,
  safety_score   integer not null default 0,
  top_speed      integer not null default 0,
  track_days     integer not null default 0,
  week_start     date not null default date_trunc('week', now())::date,
  updated_at     timestamptz not null default now()
);

-- =====================================================================
-- leaderboard_entries — aggregated ranks; one row per (user, mode, week)
-- =====================================================================
create table if not exists public.leaderboard_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  mode       text not null check (mode in ('Track','Safety','Endurance')),
  score      numeric not null,
  week_start date not null,
  rank       integer,
  unique (user_id, mode, week_start)
);
create index if not exists leaderboard_week_idx
  on public.leaderboard_entries (week_start, mode, rank);

-- =====================================================================
-- Auto-provision profile + stats on signup
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, username, car, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'driver_' || substr(new.id::text, 1, 4)),
    coalesce(new.raw_user_meta_data->>'car', ''),
    coalesce(new.raw_user_meta_data->>'avatar', '')
  )
  on conflict (id) do nothing;

  insert into public.user_stats (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- recompute_leaderboard(week_start) — rebuild leaderboard_entries for a week
-- from drive_events. Called by submit-drive (immediate) and pg_cron (daily).
-- =====================================================================
create or replace function public.recompute_leaderboard(p_week date)
returns void
language plpgsql
security definer
as $$
begin
  delete from public.leaderboard_entries where week_start = p_week;

  insert into public.leaderboard_entries (user_id, mode, score, week_start, rank)
  select user_id, mode, score, p_week,
         rank() over (partition by mode order by score desc)
  from (
    -- Track: max top speed (mph), only sessions run at a circuit
    select user_id, 'Track' as mode,
           max(top_speed_mph)::numeric as score
    from public.drive_events
    where track_id is not null
      and date_trunc('week', started_at)::date = p_week
    group by user_id

    union all

    -- Endurance: total miles driven
    select user_id, 'Endurance' as mode,
           coalesce(sum(distance_mi), 0)::numeric as score
    from public.drive_events
    where date_trunc('week', started_at)::date = p_week
    group by user_id

    union all

    -- Safety: clamp(1000 - 10 * events_per_100mi, 0, 1000)
    select user_id, 'Safety' as mode,
           greatest(0, least(1000,
             1000 - 10 * (sum(safety_events)::numeric / nullif(sum(distance_mi), 0)) * 100
           )) as score
    from public.drive_events
    where date_trunc('week', started_at)::date = p_week
    group by user_id
  ) agg;
end;
$$;

-- =====================================================================
-- aggregate_user_week(user, week) — per-user weekly aggregates for user_stats.
-- Returns jsonb: { distance_mi, top_speed, track_days, safety_score(0-100) }.
-- Called by the submit-drive Edge Function to (re)write user_stats on submit,
-- which also gives the weekly reset for free (a new week sums to zero).
-- =====================================================================
create or replace function public.aggregate_user_week(p_user uuid, p_week date)
returns jsonb
language sql
security definer
as $$
  select jsonb_build_object(
    'distance_mi', coalesce(sum(distance_mi), 0),
    'top_speed',   coalesce(max(top_speed_mph), 0),
    'track_days',  count(*) filter (where track_id is not null),
    'safety_score', greatest(0, least(100,
      100 - (sum(safety_events)::numeric / nullif(sum(distance_mi), 0)) * 100))
  )
  from public.drive_events
  where user_id = p_user and date_trunc('week', started_at)::date = p_week;
$$;

-- =====================================================================
-- pg_cron: daily recompute of the current week's leaderboard
-- =====================================================================
select cron.schedule(
  'octane-leaderboard-daily',
  '5 0 * * *',
  $$select public.recompute_leaderboard(date_trunc('week', now())::date);$$
);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles             enable row level security;
alter table public.tracks                enable row level security;
alter table public.drive_events          enable row level security;
alter table public.user_stats           enable row level security;
alter table public.leaderboard_entries  enable row level security;

-- profiles: public read (leaderboards show handle/avatar/car), owner write
drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read" on public.profiles
  for select using (true);

drop policy if exists "profiles_owner_write" on public.profiles;
create policy "profiles_owner_write" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles_owner_insert" on public.profiles;
create policy "profiles_owner_insert" on public.profiles
  for insert with check (id = auth.uid());

-- tracks: public read (catalog), no client writes
drop policy if exists "tracks_public_read" on public.tracks;
create policy "tracks_public_read" on public.tracks
  for select using (true);

-- drive_events: owner read only; inserts happen via the submit-drive Edge
-- Function using the service role key (bypasses RLS), so no insert policy.
drop policy if exists "drive_events_owner_read" on public.drive_events;
create policy "drive_events_owner_read" on public.drive_events
  for select using (user_id = auth.uid());

-- user_stats: owner read only; writes via Edge Function (service role)
drop policy if exists "user_stats_owner_read" on public.user_stats;
create policy "user_stats_owner_read" on public.user_stats
  for select using (user_id = auth.uid());

-- leaderboard_entries: public read (guests can view the board), no client writes
drop policy if exists "leaderboard_public_read" on public.leaderboard_entries;
create policy "leaderboard_public_read" on public.leaderboard_entries
  for select using (true);

-- =====================================================================
-- Seed circuits (geofence + plausibility reference data)
-- =====================================================================
insert into public.tracks (name, location, lat, lng, radius, record_speed) values
  ('WeatherTech Raceway Laguna Seca', 'Salinas, CA', 36.5864, -121.7520, 1500, 102),
  ('Willow Springs International Raceway', 'Rosamond, CA', 35.0377, -118.2360, 2000, 140),
  ('Buttonwillow Raceway Park', 'Buttonwillow, CA', 35.3950, -119.5100, 1500, 130),
  ('Road Atlanta', 'Braselton, GA', 34.3065, -84.1440, 2000, 150),
  ('Virginia International Raceway', 'Alton, VA', 36.5550, -79.2150, 2000, 140),
  ('Lime Rock Park', 'Lakeville, CT', 41.9550, -73.3840, 1200, 110)
on conflict do nothing;