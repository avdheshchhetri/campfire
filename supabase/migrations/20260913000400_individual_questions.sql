-- Individual variants retain the existing round lifecycle and private answer boundary.
begin;
create table if not exists cf_private.individual_questions (
 challenge_id uuid not null references public.challenges(id) on delete cascade,
 user_id uuid not null references public.profiles(id),
 question text not null, answer text not null, solved boolean not null default false,
 primary key(challenge_id,user_id)
);
revoke all on cf_private.individual_questions from public,anon,authenticated;

create or replace function public.cf_save_individual(p_room uuid,p_session uuid,p_user uuid,p_topic uuid,p_questions jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare roster uuid[]; n int; cid uuid; pid text; title text; item jsonb; i int;
begin
 if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_user) then raise exception 'Join this room first.'; end if;
 perform 1 from public.sessions where id=p_session and room_id=p_room and is_active and ended_at is null for update;
 if not found then raise exception 'This session has ended.'; end if;
 select id into cid from public.challenges where session_id=p_session and type='split_puzzle' and status='active';
 if cid is not null then return cid; end if;
 select t.title into title from public.syllabus_topics t where t.id=p_topic and t.room_id=p_room;
 if not found then raise exception 'Select a topic from this room.'; end if;
 select array_agg(sp.user_id order by sp.user_id) into roster from public.session_presence sp
 join public.room_members rm on rm.room_id=p_room and rm.user_id=sp.user_id where sp.session_id=p_session;
 n:=coalesce(cardinality(roster),0);
 if n not between 1 and 6 or p_user is null or not p_user=any(roster) then raise exception 'Join a session with 1–6 participants.'; end if;
 if jsonb_typeof(p_questions) is distinct from 'array' then raise exception 'Invalid questions.'; end if;
 if jsonb_array_length(p_questions)<>6 then raise exception 'Expected six question variants.'; end if;
 for item in select value from jsonb_array_elements(p_questions) loop
  if jsonb_typeof(item->'question') is distinct from 'string' or length(trim(item->>'question')) not between 1 and 2100
   or jsonb_typeof(item->'full_answer') is distinct from 'string' or length(trim(item->>'full_answer')) not between 1 and 160
   or jsonb_typeof(item->'hint') is distinct from 'string' or length(trim(item->>'hint')) not between 1 and 1500 then raise exception 'Invalid question.'; end if;
 end loop;
 if (select count(distinct value->>'question') from jsonb_array_elements(p_questions))<>6 then raise exception 'Questions must be distinct.'; end if;
 pid:='generated:'||gen_random_uuid()::text;
 insert into cf_private.puzzles(id,title,prompt,clues,answers)
 values(pid,title,'Different questions, one topic. Ask your teammate for your hint.',array_fill('Individual hint'::text,array[6]),array['unused']);
 insert into public.challenges(room_id,session_id,topic_id,type,status,title,prompt)
 values(p_room,p_session,p_topic,'split_puzzle','active',title,'Different questions, one topic. Solve your own question with a teammate’s help.') returning id into cid;
 insert into cf_private.rounds values(cid,pid,roster);
 for i in 1..n loop
  item:=p_questions->(i-1);
  insert into cf_private.individual_questions(challenge_id,user_id,question,answer)
  values(cid,roster[i],item->>'question',lower(regexp_replace(trim(item->>'full_answer'),'\s+','','g')));
  insert into public.challenge_clues(challenge_id,assigned_to,clue_text,revealed,order_index)
  values(cid,roster[(i%n)+1],concat(case when n=1 then 'Your solo hint' else 'Hint for '||coalesce((select display_name from public.profiles where id=roster[i]),'your teammate') end,
    E'\n\nQuestion: ',item->>'question',E'\n\nHint: ',item->>'hint'),true,i-1);
 end loop;
 return cid;
end;
$$;
revoke all on function public.cf_save_individual(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cf_save_individual(uuid,uuid,uuid,uuid,jsonb) to service_role;

-- Keep old rounds and the existing practice-bank behavior intact.
do $$ begin
 if to_regprocedure('public.cf_snapshot_shared(uuid,uuid)') is null then
  alter function public.cf_snapshot(uuid,uuid) rename to cf_snapshot_shared;
  alter function public.cf_submit(uuid,uuid,text) rename to cf_submit_shared;
 end if;
end $$;
revoke all on function public.cf_snapshot_shared(uuid,uuid),public.cf_submit_shared(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.cf_snapshot(p_room uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; cid uuid; own cf_private.individual_questions;
begin
 result:=public.cf_snapshot_shared(p_room,p_session);
 cid:=(result->'challenge'->>'id')::uuid;
 if exists(select 1 from cf_private.individual_questions where challenge_id=cid) then
  select * into own from cf_private.individual_questions where challenge_id=cid and user_id=auth.uid();
  result:=jsonb_set(result,'{challenge}',(result->'challenge')||jsonb_build_object(
   'individual',true,'prompt',coalesce(own.question,'Join the next round to get your own question.'),
   'own_solved',coalesce(own.solved,false),
   'solved_count',(select count(*) from cf_private.individual_questions where challenge_id=cid and solved)));
 end if;
 return result;
end;
$$;
create or replace function public.cf_submit(p_room uuid,p_session uuid,p_answer text)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.challenges; own cf_private.individual_questions; correct boolean; complete boolean;
begin
 if not public.cf_is_member(p_room) then raise exception 'Join this room first.'; end if;
 perform 1 from public.sessions where id=p_session and room_id=p_room and is_active and ended_at is null for update;
 if not found then raise exception 'This session has ended.'; end if;
 select * into c from public.challenges where room_id=p_room and session_id=p_session and type='split_puzzle' order by created_at desc,id desc limit 1 for update;
 if not exists(select 1 from cf_private.individual_questions where challenge_id=c.id) then
  return public.cf_submit_shared(p_room,p_session,p_answer);
 end if;
 select * into own from cf_private.individual_questions where challenge_id=c.id and user_id=auth.uid();
 if not found then raise exception 'You are not assigned to this round.'; end if;
 if c.status not in ('active','solved') then raise exception 'This round is no longer active.'; end if;
 if p_answer is null or length(trim(p_answer)) not between 1 and 160 then raise exception 'Enter an answer of 1–160 characters.'; end if;
 if own.solved then return true; end if;
 correct:=lower(regexp_replace(trim(p_answer),'\s+','','g'))=own.answer;
 if correct then update cf_private.individual_questions set solved=true where challenge_id=c.id and user_id=auth.uid(); end if;
 select bool_and(solved) into complete from cf_private.individual_questions where challenge_id=c.id;
 update public.challenges set attempts=attempts+1,status=case when complete then 'solved' else 'active' end,
 completed_at=case when complete then now() else null end where id=c.id;
 return correct;
end;
$$;
revoke all on function public.cf_snapshot(uuid,uuid),public.cf_submit(uuid,uuid,text) from public,anon;
grant execute on function public.cf_snapshot(uuid,uuid),public.cf_submit(uuid,uuid,text) to authenticated;
commit;
