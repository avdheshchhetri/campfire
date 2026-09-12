-- Apply after the shared schema. The team's columns and leaderboard aggregation
-- stay unchanged. Anonymous Auth users have the authenticated database role.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- SECURITY DEFINER avoids room_members policies recursively querying themselves.
-- These helpers live outside the Data API's exposed schemas, use a fixed search
-- path, and derive the requesting user from the verified JWT via auth.uid().
create function private.is_room_member(p_room_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members rm
    where rm.room_id = p_room_id and rm.user_id = (select auth.uid())
  );
$$;

create function private.shares_room(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_members mine
    join public.room_members theirs on theirs.room_id = mine.room_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

revoke all on function private.is_room_member(uuid) from public, anon;
revoke all on function private.shares_room(uuid) from public, anon;
grant execute on function private.is_room_member(uuid) to authenticated;
grant execute on function private.shares_room(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.syllabus_topics enable row level security;
alter table public.sessions enable row level security;
alter table public.session_presence enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_clues enable row level security;

-- A regular view otherwise runs with its owner's table visibility. PostgreSQL
-- 15+ security_invoker makes this exact shared view honor the caller's RLS.
alter view public.leaderboard set (security_invoker = true);

revoke all on table public.profiles, public.rooms, public.room_members,
  public.syllabus_topics, public.sessions, public.session_presence,
  public.challenges, public.challenge_clues, public.leaderboard
  from public, anon, authenticated;

grant select, insert on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.rooms to authenticated;
grant update (name, subject, exam_date) on public.rooms to authenticated;
grant select, delete on public.room_members to authenticated;
grant select, insert, delete on public.syllabus_topics to authenticated;
grant update (title, order_index, status, last_taught_by, last_taught_at)
  on public.syllabus_topics to authenticated;
grant select, insert, delete on public.sessions to authenticated;
grant update (started_at, ended_at, is_active) on public.sessions to authenticated;
grant select, insert, delete on public.session_presence to authenticated;
grant update (phone_state, updated_at) on public.session_presence to authenticated;
grant select, insert, delete on public.challenges to authenticated;
grant update (session_id, type, topic_id, status) on public.challenges to authenticated;
grant select, insert, delete on public.challenge_clues to authenticated;
grant update (assigned_to, clue_text, revealed, order_index)
  on public.challenge_clues to authenticated;
grant select on public.leaderboard to authenticated;

-- Parent/identity columns are deliberately not updateable by browser clients.
-- This prevents moving an existing parent to a different room and leaving its
-- children's foreign keys pointing across room boundaries.
create policy profiles_read on public.profiles
for select to authenticated
using (id = (select auth.uid()) or private.shares_room(id));
create policy profiles_create_self on public.profiles
for insert to authenticated
with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy rooms_read on public.rooms
for select to authenticated using (private.is_room_member(id));
create policy rooms_update_owner on public.rooms
for update to authenticated
using (created_by = (select auth.uid()) and private.is_room_member(id))
with check (created_by = (select auth.uid()) and private.is_room_member(id));

create policy room_members_read on public.room_members
for select to authenticated using (private.is_room_member(room_id));
create policy room_members_leave_self on public.room_members
for delete to authenticated using (user_id = (select auth.uid()));
-- No INSERT policy or grant: membership can only be created by the two RPCs.

create policy syllabus_topics_read on public.syllabus_topics
for select to authenticated using (private.is_room_member(room_id));
create policy syllabus_topics_create on public.syllabus_topics
for insert to authenticated
with check (
  private.is_room_member(room_id)
  and (last_taught_by is null or exists (
    select 1 from public.room_members rm
    where rm.room_id = syllabus_topics.room_id and rm.user_id = last_taught_by
  ))
);
create policy syllabus_topics_update on public.syllabus_topics
for update to authenticated
using (private.is_room_member(room_id))
with check (
  private.is_room_member(room_id)
  and (last_taught_by is null or exists (
    select 1 from public.room_members rm
    where rm.room_id = syllabus_topics.room_id and rm.user_id = last_taught_by
  ))
);
create policy syllabus_topics_delete on public.syllabus_topics
for delete to authenticated using (private.is_room_member(room_id));

create policy sessions_read on public.sessions
for select to authenticated using (private.is_room_member(room_id));
create policy sessions_create on public.sessions
for insert to authenticated with check (private.is_room_member(room_id));
create policy sessions_update on public.sessions
for update to authenticated
using (private.is_room_member(room_id)) with check (private.is_room_member(room_id));
create policy sessions_delete on public.sessions
for delete to authenticated using (private.is_room_member(room_id));

create policy session_presence_read on public.session_presence
for select to authenticated using (exists (
  select 1 from public.sessions s
  where s.id = session_id and private.is_room_member(s.room_id)
));
create policy session_presence_create_self on public.session_presence
for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.sessions s
    where s.id = session_id and private.is_room_member(s.room_id)
  )
);
create policy session_presence_update_self on public.session_presence
for update to authenticated
using (user_id = (select auth.uid()) and exists (
  select 1 from public.sessions s
  where s.id = session_id and private.is_room_member(s.room_id)
))
with check (user_id = (select auth.uid()) and exists (
  select 1 from public.sessions s
  where s.id = session_id and private.is_room_member(s.room_id)
));
create policy session_presence_delete_self on public.session_presence
for delete to authenticated using (user_id = (select auth.uid()) and exists (
  select 1 from public.sessions s
  where s.id = session_id and private.is_room_member(s.room_id)
));

create policy challenges_read on public.challenges
for select to authenticated using (private.is_room_member(room_id));
create policy challenges_create on public.challenges
for insert to authenticated with check (
  private.is_room_member(room_id)
  and (session_id is null or exists (
    select 1 from public.sessions s
    where s.id = session_id and s.room_id = challenges.room_id
  ))
  and (topic_id is null or exists (
    select 1 from public.syllabus_topics st
    where st.id = topic_id and st.room_id = challenges.room_id
  ))
);
create policy challenges_update on public.challenges
for update to authenticated
using (private.is_room_member(room_id))
with check (
  private.is_room_member(room_id)
  and (session_id is null or exists (
    select 1 from public.sessions s
    where s.id = session_id and s.room_id = challenges.room_id
  ))
  and (topic_id is null or exists (
    select 1 from public.syllabus_topics st
    where st.id = topic_id and st.room_id = challenges.room_id
  ))
);
create policy challenges_delete on public.challenges
for delete to authenticated using (private.is_room_member(room_id));

create policy challenge_clues_read on public.challenge_clues
for select to authenticated using (exists (
  select 1 from public.challenges c
  where c.id = challenge_id and private.is_room_member(c.room_id)
));
create policy challenge_clues_create on public.challenge_clues
for insert to authenticated with check (exists (
  select 1 from public.challenges c
  where c.id = challenge_id and private.is_room_member(c.room_id)
    and (assigned_to is null or exists (
      select 1 from public.room_members rm
      where rm.room_id = c.room_id and rm.user_id = assigned_to
    ))
));
create policy challenge_clues_update on public.challenge_clues
for update to authenticated
using (exists (
  select 1 from public.challenges c
  where c.id = challenge_id and private.is_room_member(c.room_id)
))
with check (exists (
  select 1 from public.challenges c
  where c.id = challenge_id and private.is_room_member(c.room_id)
    and (assigned_to is null or exists (
      select 1 from public.room_members rm
      where rm.room_id = c.room_id and rm.user_id = assigned_to
    ))
));
create policy challenge_clues_delete on public.challenge_clues
for delete to authenticated using (exists (
  select 1 from public.challenges c
  where c.id = challenge_id and private.is_room_member(c.room_id)
));

create function public.create_room(
  p_name text,
  p_subject text default null,
  p_exam_date date default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
  v_attempt integer;
begin
  if v_user_id is null then
    raise exception 'Sign in before creating a room.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'Create your profile before creating a room.';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Enter a room name.' using errcode = '22023';
  end if;

  for v_attempt in 1..5 loop
    begin
      insert into public.rooms (name, subject, exam_date, join_code, created_by)
      values (
        btrim(p_name), nullif(btrim(p_subject), ''), p_exam_date,
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), v_user_id
      ) returning id into v_room_id;
      exit;
    exception when unique_violation then
      if v_attempt = 5 then raise; end if;
    end;
  end loop;

  insert into public.room_members (room_id, user_id) values (v_room_id, v_user_id);
  return v_room_id;
end;
$$;

create function public.join_room(p_join_code text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in before joining a room.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'Create your profile before joining a room.';
  end if;

  select id into v_room_id from public.rooms
  where join_code = upper(btrim(p_join_code));
  if v_room_id is null then
    raise exception 'That room code was not found. Check the code and try again.';
  end if;

  insert into public.room_members (room_id, user_id) values (v_room_id, v_user_id)
  on conflict (room_id, user_id) do nothing;
  return v_room_id;
end;
$$;

revoke all on function public.create_room(text, text, date) from public, anon;
revoke all on function public.join_room(text) from public, anon;
grant execute on function public.create_room(text, text, date) to authenticated;
grant execute on function public.join_room(text) to authenticated;

-- Supabase API operations normally query membership by user_id and topics and
-- sessions by room_id. The original primary keys only cover the other direction.
create index room_members_user_id_idx on public.room_members (user_id);
create index syllabus_topics_room_id_idx on public.syllabus_topics (room_id);
create index sessions_room_id_idx on public.sessions (room_id);
create index challenges_room_id_idx on public.challenges (room_id);
create index challenge_clues_challenge_id_idx on public.challenge_clues (challenge_id);

commit;
