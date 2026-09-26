-- Octane: Social Driving — groups + cross-device chat (BACKEND_PLAN §3-§5).
-- Run via `supabase db push` (or the Supabase SQL editor). Idempotent-ish.
--
-- Creates: groups, group_members, messages tables; RLS policies; a list_groups()
-- helper RPC; and adds `messages` to the Supabase Realtime publication so chat
-- is delivered live, RLS-scoped.

-- =====================================================================
-- groups
-- =====================================================================
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  image       text not null default '',
  is_private  boolean not null default false,
  invite_code text,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create unique index if not exists groups_invite_code_idx on public.groups (invite_code) where invite_code is not null;

-- =====================================================================
-- group_members
-- =====================================================================
create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  rank      text not null default 'Rookie',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

-- =====================================================================
-- messages
-- =====================================================================
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_group_created_idx on public.messages (group_id, created_at);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.messages       enable row level security;

-- groups: read public groups OR any group you're a member of; owner writes.
drop policy if exists "groups_read" on public.groups;
create policy "groups_read" on public.groups
  for select using (
    not is_private
    or exists (select 1 from public.group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid())
  );

drop policy if exists "groups_owner_write" on public.groups;
create policy "groups_owner_write" on public.groups
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

-- group_members: members read their group's rows; a user inserts their own row
-- (join); the group owner can update ranks (promote). Deletes: self (leave) or owner.
drop policy if exists "group_members_read" on public.group_members;
create policy "group_members_read" on public.group_members
  for select using (
    exists (select 1 from public.group_members gm
            where gm.group_id = group_members.group_id and gm.user_id = auth.uid())
  );

drop policy if exists "group_members_insert_self" on public.group_members;
create policy "group_members_insert_self" on public.group_members
  for insert with check (user_id = auth.uid());

drop policy if exists "group_members_update" on public.group_members;
create policy "group_members_update" on public.group_members
  for update using (
    user_id = auth.uid()
    or exists (select 1 from public.groups g where g.id = group_members.group_id and g.created_by = auth.uid())
  ) with check (true);

drop policy if exists "group_members_delete" on public.group_members;
create policy "group_members_delete" on public.group_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.groups g where g.id = group_members.group_id and g.created_by = auth.uid())
  );

-- messages: members of the group can read; members can insert their own.
drop policy if exists "messages_read" on public.messages;
create policy "messages_read" on public.messages
  for select using (
    exists (select 1 from public.group_members gm where gm.group_id = messages.group_id and gm.user_id = auth.uid())
  );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from public.group_members gm where gm.group_id = messages.group_id and gm.user_id = auth.uid())
  );

-- =====================================================================
-- list_groups() — one query for the Groups list view
-- Returns public groups + the caller's joined (incl. private) groups with
-- member_count, is_joined, and the caller's user_rank.
-- =====================================================================
create or replace function public.list_groups()
returns table (
  id uuid, name text, description text, image text, is_private boolean,
  invite_code text, created_by uuid, created_at timestamptz,
  member_count bigint, is_joined boolean, user_rank text
)
language sql
security definer
as $$
  with me as (select auth.uid() as uid)
  select g.id, g.name, g.description, g.image, g.is_private, g.invite_code,
         g.created_by, g.created_at,
         cnt.member_count,
         coalesce(m.user_id is not null, false) as is_joined,
         m.rank as user_rank
  from public.groups g
  left join public.group_members m on m.group_id = g.id and m.user_id = (select uid from me)
  left join lateral (
    select count(*)::bigint as member_count from public.group_members gm where gm.group_id = g.id
  ) cnt on true
  where (select uid from me) is not null
    and (not g.is_private or m.user_id is not null);
$$;

-- =====================================================================
-- Realtime — deliver message INSERTs live, RLS-scoped.
-- =====================================================================
alter publication supabase_realtime add table public.messages;
alter table public.messages replica identity full;