-- Fix the infinite-recursion in the groups chat RLS (migration 0002 referenced
-- group_members from within group_members' own policy). Replace those
-- self-referential checks with security-definer helper functions, and add a
-- join_group_by_code() RPC so private groups can be joined by invite code
-- (RLS otherwise hides private groups from non-members).

-- Security-definer membership / ownership checks (run as owner, so they don't
-- re-enter RLS on group_members / groups).
create or replace function public.is_member(p_group uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.group_members where group_id = p_group and user_id = auth.uid());
$$;

create or replace function public.owns_group(p_group uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.groups where id = p_group and created_by = auth.uid());
$$;

-- Join a group by its invite code (private groups). Enforces the code
-- server-side; inserts the caller's membership; returns the group id (or null).
create or replace function public.join_group_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups%rowtype;
begin
  if p_code is null or trim(p_code) = '' then return null; end if;
  select * into g from public.groups where invite_code = trim(p_code);
  if not found then return null; end if;
  insert into public.group_members (group_id, user_id, rank)
  values (g.id, auth.uid(), 'Rookie')
  on conflict (group_id, user_id) do nothing;
  return g.id;
end;
$$;

-- Recreate the policies without self-reference.
drop policy if exists "groups_read" on public.groups;
create policy "groups_read" on public.groups
  for select using (not is_private or public.is_member(id));

drop policy if exists "groups_owner_write" on public.groups;
create policy "groups_owner_write" on public.groups
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "group_members_read" on public.group_members;
create policy "group_members_read" on public.group_members
  for select using (public.is_member(group_id));

drop policy if exists "group_members_insert_self" on public.group_members;
create policy "group_members_insert_self" on public.group_members
  for insert with check (user_id = auth.uid());

drop policy if exists "group_members_update" on public.group_members;
create policy "group_members_update" on public.group_members
  for update using (user_id = auth.uid() or public.owns_group(group_id)) with check (true);

drop policy if exists "group_members_delete" on public.group_members;
create policy "group_members_delete" on public.group_members
  for delete using (user_id = auth.uid() or public.owns_group(group_id));

drop policy if exists "messages_read" on public.messages;
create policy "messages_read" on public.messages
  for select using (public.is_member(group_id));

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert with check (sender_id = auth.uid() and public.is_member(group_id));