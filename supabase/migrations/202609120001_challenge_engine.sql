-- Apply AFTER Campfire's shared schema supplied in the task.
-- All mutations and snapshots run through membership-checked RPCs.
begin;
create schema if not exists cf_private;
revoke all on schema cf_private from public, anon, authenticated;

alter table public.challenges add column if not exists title text;
alter table public.challenges add column if not exists prompt text;
alter table public.challenges add column if not exists attempts integer not null default 0;
alter table public.challenges add column if not exists completed_at timestamptz;
create unique index cf_one_active_round on public.challenges(session_id)
  where status = 'active' and type = 'split_puzzle';

create table cf_private.puzzles (
  id text primary key, title text not null, prompt text not null,
  clues text[] not null check (cardinality(clues) = 6),
  answers text[] not null
);
create table cf_private.rounds (
  challenge_id uuid primary key references public.challenges(id) on delete cascade,
  puzzle_id text not null references cf_private.puzzles(id),
  participants uuid[] not null
);
revoke all on all tables in schema cf_private from public, anon, authenticated;

insert into cf_private.puzzles values
('circuit', 'Complete the circuit',
 'Calculate the current, in amperes, through a circuit containing three resistors and one battery.',
 array['The resistors are connected in series.', 'The first resistor has resistance 2 Ω.', 'The second resistor has resistance 4 Ω.', 'The third resistor has resistance 6 Ω.', 'The battery provides 24 volts. For series resistors, add the resistances.', 'Ohm’s law: current in amperes = voltage ÷ total resistance.'],
 array['2','2a','2amp','2amps','2amperes','2.0','2.0a']),
('mean', 'Find the missing measurement',
 'Find the missing fifth measurement in a set of five numbers.',
 array['The arithmetic mean of all five measurements is 12.', 'The first measurement is 7.', 'The second measurement is 9.', 'The third measurement is 14.', 'The fourth measurement is 16.', 'Mean = sum ÷ number of measurements. There are exactly five measurements.'],
 array['14','14.0']),
('logic', 'The lab schedule',
 'Three students each use one distinct lab on a distinct day. Which day does Alex use a lab? Answer Monday, Tuesday, or Wednesday.',
 array['The students are Alex, Bea, and Chen. Each attends on a different day: Monday, Tuesday, or Wednesday.', 'The labs are optics, chemistry, and robotics. Each student uses exactly one different lab.', 'The robotics lab is used on Wednesday.', 'Bea uses the chemistry lab.', 'Chen attends on Monday.', 'Alex does not use the optics lab.'],
 array['wednesday','wed']);

-- This helper is also used by restrictive clue policies to prevent a future
-- permissive policy from accidentally exposing another player's clue.
create or replace function public.cf_is_member(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.room_members where room_id=p_room and user_id=auth.uid());
$$;
create or replace function public.cf_can_read_challenge(p_challenge uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.challenges c where c.id=p_challenge and public.cf_is_member(c.room_id));
$$;
alter table public.challenges enable row level security;
alter table public.challenge_clues enable row level security;
revoke all on public.challenges, public.challenge_clues from anon, authenticated;
grant select on public.challenges, public.challenge_clues to authenticated;
create policy cf_challenges_read on public.challenges for select to authenticated using (public.cf_is_member(room_id));
create policy cf_challenges_boundary on public.challenges as restrictive for select to authenticated using (public.cf_is_member(room_id));
create policy cf_clues_read on public.challenge_clues for select to authenticated
 using (assigned_to = auth.uid() and public.cf_can_read_challenge(challenge_id));
create policy cf_clues_boundary on public.challenge_clues as restrictive for select to authenticated
 using (assigned_to = auth.uid() and public.cf_can_read_challenge(challenge_id));

create or replace function public.cf_snapshot(p_room uuid, p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.challenges; roster uuid[]; result jsonb;
begin
 if not public.cf_is_member(p_room) then raise exception 'Join this room before opening a challenge.'; end if;
 if not exists(select 1 from public.sessions where id=p_session and room_id=p_room) then raise exception 'Session does not belong to this room.'; end if;
 select * into c from public.challenges where session_id=p_session and room_id=p_room and type='split_puzzle' order by created_at desc, id desc limit 1;
 if c.id is not null then select participants into roster from cf_private.rounds where challenge_id=c.id; end if;
 -- For a new/cancelled round show the current session roster; active and solved
 -- rounds keep their original participants so assignments never move mid-round.
 if c.id is null or c.status='cancelled' then
   select array_agg(sp.user_id order by sp.user_id) into roster from public.session_presence sp
    join public.room_members rm on rm.room_id=p_room and rm.user_id=sp.user_id where sp.session_id=p_session;
 end if;
 select jsonb_build_object(
  'challenge', case when c.id is null then null else jsonb_build_object('id',c.id,'title',c.title,'prompt',c.prompt,'status',c.status,'attempts',c.attempts,'created_at',c.created_at) end,
  'players', coalesce((select jsonb_agg(jsonb_build_object('user_id',p.id,'display_name',p.display_name) order by p.id) from public.profiles p where p.id=any(roster)), '[]'::jsonb),
  'clues', coalesce((select jsonb_agg(jsonb_build_object('id',cl.id,'clue_text',cl.clue_text,'order_index',cl.order_index) order by cl.order_index) from public.challenge_clues cl where cl.challenge_id=c.id and cl.assigned_to=auth.uid()), '[]'::jsonb)
 ) into result;
 return result;
end;
$$;

create or replace function public.cf_start(p_room uuid, p_session uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare roster uuid[]; n int; puzzle cf_private.puzzles; previous text; cid uuid; i int;
begin
 if not public.cf_is_member(p_room) then raise exception 'Join this room first.'; end if;
 -- Lock the shared session row: simultaneous starts serialize here.
 perform 1 from public.sessions where id=p_session and room_id=p_room and is_active=true and ended_at is null for update;
 if not found then raise exception 'This study session has ended or is unavailable.'; end if;
 select id into cid from public.challenges where session_id=p_session and type='split_puzzle' and status='active';
 if cid is not null then return cid; end if;
 select array_agg(sp.user_id order by sp.user_id) into roster from public.session_presence sp
 join public.room_members rm on rm.room_id=p_room and rm.user_id=sp.user_id where sp.session_id=p_session;
 n := coalesce(cardinality(roster),0);
 if n < 3 or n > 6 then raise exception 'A challenge needs 3–6 session participants.'; end if;
 if not auth.uid() = any(roster) then raise exception 'Join the study session before starting a challenge.'; end if;
 select r.puzzle_id into previous from cf_private.rounds r join public.challenges c on c.id=r.challenge_id
 where c.session_id=p_session order by c.created_at desc,c.id desc limit 1;
 select * into puzzle from cf_private.puzzles where id is distinct from previous order by random() limit 1;
 insert into public.challenges(room_id,session_id,type,status,title,prompt) values(p_room,p_session,'split_puzzle','active',puzzle.title,puzzle.prompt) returning id into cid;
 insert into cf_private.rounds values(cid,puzzle.id,roster);
 for i in 1..6 loop
   insert into public.challenge_clues(challenge_id,assigned_to,clue_text,revealed,order_index)
   values(cid,roster[((i-1)%n)+1],puzzle.clues[i],true,i);
 end loop;
 return cid;
end;
$$;

create or replace function public.cf_submit(p_room uuid, p_session uuid, p_answer text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare c public.challenges; correct boolean;
begin
 if not public.cf_is_member(p_room) then raise exception 'Join this room first.'; end if;
 perform 1 from public.sessions where id=p_session and room_id=p_room and is_active and ended_at is null for update;
 if not found then raise exception 'This session has ended.'; end if;
 if p_answer is null or length(trim(p_answer))=0 or length(p_answer)>160 then raise exception 'Enter an answer of 1–160 characters.'; end if;
 select * into c from public.challenges where room_id=p_room and session_id=p_session and type='split_puzzle' order by created_at desc,id desc limit 1 for update;
 if c.id is null then raise exception 'Start a challenge first.'; end if;
 if not exists(select 1 from cf_private.rounds where challenge_id=c.id and auth.uid()=any(participants)) then raise exception 'You are not assigned to this round.'; end if;
 if c.status='solved' then return true; end if;
 if c.status<>'active' then raise exception 'This round is no longer active.'; end if;
 select lower(regexp_replace(trim(p_answer),'\s+','','g'))=any(p.answers) into correct
 from cf_private.rounds r join cf_private.puzzles p on p.id=r.puzzle_id where r.challenge_id=c.id;
 update public.challenges set attempts=attempts+1,status=case when correct then 'solved' else 'active' end,
 completed_at=case when correct then now() else null end where id=c.id;
 return correct;
end;
$$;

create or replace function public.cf_cancel(p_room uuid, p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
 if not public.cf_is_member(p_room) then raise exception 'Join this room first.'; end if;
 perform 1 from public.sessions where id=p_session and room_id=p_room for update;
 if not found then raise exception 'Session does not belong to this room.'; end if;
 select id into cid from public.challenges where room_id=p_room and session_id=p_session and type='split_puzzle' and status='active' for update;
 if cid is null then return; end if;
 if not exists(select 1 from cf_private.rounds where challenge_id=cid and auth.uid()=any(participants)) then raise exception 'Only assigned teammates can end this round.'; end if;
 update public.challenges set status='cancelled',completed_at=now() where id=cid;
end;
$$;

revoke all on function public.cf_is_member(uuid), public.cf_can_read_challenge(uuid), public.cf_snapshot(uuid,uuid), public.cf_start(uuid,uuid), public.cf_submit(uuid,uuid,text), public.cf_cancel(uuid,uuid) from public, anon;
grant execute on function public.cf_is_member(uuid), public.cf_can_read_challenge(uuid), public.cf_snapshot(uuid,uuid), public.cf_start(uuid,uuid), public.cf_submit(uuid,uuid,text), public.cf_cancel(uuid,uuid) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='challenges') then
  alter publication supabase_realtime add table public.challenges;
 end if;
end $$;
commit;
