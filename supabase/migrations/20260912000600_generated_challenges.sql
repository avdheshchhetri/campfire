begin;

-- Only the authenticated server route can import generated answers.
create or replace function public.cf_save_generated(
 p_room uuid, p_session uuid, p_user uuid, p_topic uuid, p_challenge jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare roster uuid[]; n int; cid uuid; pid text; topic_title text;
 clue_count int; clue jsonb; clue_texts text[] := '{}'; i int;
begin
 if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_user)
 then raise exception 'Join this room first.'; end if;
 perform 1 from public.sessions where id=p_session and room_id=p_room and is_active and ended_at is null for update;
 if not found then raise exception 'This session has ended.'; end if;
 select id into cid from public.challenges where session_id=p_session and type='split_puzzle' and status='active';
 if cid is not null then return cid; end if;
 select title into topic_title from public.syllabus_topics where id=p_topic and room_id=p_room;
 if not found then raise exception 'Topic does not belong to this room.'; end if;
 select array_agg(sp.user_id order by sp.user_id) into roster from public.session_presence sp
 join public.room_members rm on rm.room_id=p_room and rm.user_id=sp.user_id where sp.session_id=p_session;
 n := coalesce(cardinality(roster),0);
 if n < 3 or n > 6 or p_user is null or not p_user=any(roster)
 then raise exception 'Join a session with 3–6 participants.'; end if;
 if jsonb_typeof(p_challenge) is distinct from 'object'
 or jsonb_typeof(p_challenge->'full_answer') is distinct from 'string'
 or length(trim(p_challenge->>'full_answer')) not between 1 and 160
 or jsonb_typeof(p_challenge->'clues') is distinct from 'array'
 then raise exception 'Invalid generated challenge.'; end if;
 clue_count := jsonb_array_length(p_challenge->'clues');
 if clue_count not between 2 and 3 then raise exception 'Expected 2–3 clues.'; end if;
 for i in 0..clue_count-1 loop
  clue := p_challenge->'clues'->i;
  if jsonb_typeof(clue->'clue_text') is distinct from 'string'
  or length(trim(clue->>'clue_text')) not between 1 and 2000
  or (clue->'order_index') is distinct from to_jsonb(i)
  then raise exception 'Invalid clue.'; end if;
  clue_texts := array_append(clue_texts, trim(clue->>'clue_text'));
 end loop;
 pid := 'generated:' || gen_random_uuid()::text;
 -- The existing private puzzle store expects six slots. Repeat clue roles there;
 -- assignments below give each participant one partial clue, never the answer.
 insert into cf_private.puzzles(id,title,prompt,clues,answers)
 values(pid,topic_title,'Combine your partial clues. Submit the short answer in the format specified in your clue.',
  array(select clue_texts[((x-1)%clue_count)+1] from generate_series(1,6) as x),
  array[lower(regexp_replace(trim(p_challenge->>'full_answer'),'\s+','','g'))]);
 insert into public.challenges(room_id,session_id,topic_id,type,status,title,prompt)
 values(p_room,p_session,p_topic,'split_puzzle','active',topic_title,
 'Combine your partial clues. Submit the short answer in the format specified in your clue.') returning id into cid;
 insert into cf_private.rounds values(cid,pid,roster);
 for i in 1..n loop
  insert into public.challenge_clues(challenge_id,assigned_to,clue_text,revealed,order_index)
  values(cid,roster[i],clue_texts[((i-1)%clue_count)+1],true,i-1);
 end loop;
 return cid;
end;
$$;
revoke all on function public.cf_save_generated(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cf_save_generated(uuid,uuid,uuid,uuid,jsonb) to service_role;

-- Keep the existing puzzle-bank path independent of generated rounds.
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
 select * into puzzle from cf_private.puzzles where id is distinct from previous and id not like 'generated:%' order by random() limit 1;
 insert into public.challenges(room_id,session_id,type,status,title,prompt) values(p_room,p_session,'split_puzzle','active',puzzle.title,puzzle.prompt) returning id into cid;
 insert into cf_private.rounds values(cid,puzzle.id,roster);
 for i in 1..6 loop
   insert into public.challenge_clues(challenge_id,assigned_to,clue_text,revealed,order_index)
   values(cid,roster[((i-1)%n)+1],puzzle.clues[i],true,i);
 end loop;
 return cid;
end;
$$;


commit;
