-- Per-person retries, hint assistance and completion gating.
begin;
alter table cf_private.individual_questions add column if not exists hint text;
alter table cf_private.individual_questions add column if not exists failed_attempts integer not null default 0;
alter table cf_private.individual_questions add column if not exists penalty_points integer not null default 0;
-- Recover hints for rounds created before this migration.
update cf_private.individual_questions q set hint=substring(cl.clue_text from position(E'\n\nHint: ' in cl.clue_text)+8)
from cf_private.rounds r, public.challenge_clues cl
where q.hint is null and r.challenge_id=q.challenge_id and cl.challenge_id=q.challenge_id
 and q.user_id=r.participants[cl.order_index+1] and position(E'\n\nHint: ' in cl.clue_text)>0;
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
 if (select count(distinct lower(regexp_replace(trim(value->>'full_answer'),'\s+','','g'))) from jsonb_array_elements(p_questions))<>6 then raise exception 'Each question needs a different answer.'; end if;
 pid:='generated:'||gen_random_uuid()::text;
 insert into cf_private.puzzles(id,title,prompt,clues,answers)
 values(pid,title,'Different questions, one topic. Ask your teammate for your hint.',array_fill('Individual hint'::text,array[6]),array['unused']);
 insert into public.challenges(room_id,session_id,topic_id,type,status,title,prompt)
 values(p_room,p_session,p_topic,'split_puzzle','active',title,'Different questions, one topic. Solve your own question with a teammate’s help.') returning id into cid;
 insert into cf_private.rounds values(cid,pid,roster);
 for i in 1..n loop
  item:=p_questions->(i-1);
  insert into cf_private.individual_questions(challenge_id,user_id,question,answer,hint)
  values(cid,roster[i],item->>'question',lower(regexp_replace(trim(item->>'full_answer'),'\s+','','g')),item->>'hint');
  insert into public.challenge_clues(challenge_id,assigned_to,clue_text,revealed,order_index)
  values(cid,roster[(i%n)+1],concat(case when n=1 then 'Your solo hint' else 'Hint for '||coalesce((select display_name from public.profiles where id=roster[i]),'your teammate') end,
    E'\n\nQuestion: ',item->>'question',E'\n\nHint: ',item->>'hint'),true,i-1);
 end loop;
 return cid;
end;
$$;
revoke all on function public.cf_save_individual(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cf_save_individual(uuid,uuid,uuid,uuid,jsonb) to service_role;

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
   'own_solved',coalesce(own.solved,false),'failed_attempts',coalesce(own.failed_attempts,0),
   'penalty_points',coalesce(own.penalty_points,0),
   'assistance_hint',case when own.failed_attempts>=8 then own.hint else null end,
   'solved_count',(select count(*) from cf_private.individual_questions where challenge_id=cid and solved)));
  result:=jsonb_set(result,'{clues}',coalesce((select jsonb_agg(jsonb_build_object(
   'id',cl.id,'order_index',cl.order_index,'clue_text',cl.clue_text,
   'hint_for_id',p.id,'hint_for_name',p.display_name) order by cl.order_index)
   from public.challenge_clues cl join cf_private.rounds r on r.challenge_id=cl.challenge_id
   join public.profiles p on p.id=r.participants[cl.order_index+1]
   where cl.challenge_id=cid and cl.assigned_to=auth.uid()),'[]'::jsonb));
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
 if correct then
  update cf_private.individual_questions set solved=true where challenge_id=c.id and user_id=auth.uid();
 else
  update cf_private.individual_questions set failed_attempts=failed_attempts+1,
   penalty_points=case when failed_attempts+1>=8 then 1 else 0 end
   where challenge_id=c.id and user_id=auth.uid();
 end if;
 select bool_and(solved) into complete from cf_private.individual_questions where challenge_id=c.id;
 update public.challenges set attempts=attempts+1,status=case when complete then 'solved' else 'active' end,
 completed_at=case when complete then now() else null end where id=c.id;
 return correct;
end;
$$;
do $$ begin
 if to_regprocedure('public.cf_cancel_shared(uuid,uuid)') is null then
  alter function public.cf_cancel(uuid,uuid) rename to cf_cancel_shared;
 end if;
end $$;
revoke all on function public.cf_cancel_shared(uuid,uuid) from public,anon,authenticated;
create or replace function public.cf_cancel(p_room uuid,p_session uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cf_is_member(p_room) then raise exception 'Join this room first.'; end if;
 perform 1 from public.sessions where id=p_session and room_id=p_room for update;
 if not found then raise exception 'Session does not belong to this room.'; end if;
 if exists(select 1 from public.challenges c join cf_private.individual_questions q on q.challenge_id=c.id
   where c.room_id=p_room and c.session_id=p_session and c.status='active')
 then raise exception 'Everyone must solve their question before the next round. You can end the study session instead.'; end if;
 perform public.cf_cancel_shared(p_room,p_session);
end;
$$;
revoke all on function public.cf_cancel(uuid,uuid) from public,anon;
grant execute on function public.cf_cancel(uuid,uuid) to authenticated;
drop function public.cf_progress(uuid);
create function public.cf_progress(p_room uuid)
returns table(room_id uuid, user_id uuid, display_name text, verified_count bigint,
 total_topics bigint, shared_verified_count bigint, solved_count bigint, penalty_points bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.cf_is_member(p_room) then raise exception 'Join this room first.'; end if;
 return query select rm.room_id, rm.user_id, p.display_name,
   (select count(*) from public.syllabus_topics t where t.room_id=p_room and t.status='verified' and t.last_taught_by=rm.user_id),
   (select count(*) from public.syllabus_topics t where t.room_id=p_room),
   (select count(*) from public.syllabus_topics t where t.room_id=p_room and t.status='verified'),
   (select count(*) from public.challenges c join cf_private.rounds r on r.challenge_id=c.id
     where c.room_id=p_room and c.status='solved' and rm.user_id=any(r.participants)),
   (select coalesce(sum(q.penalty_points),0)::bigint from cf_private.individual_questions q join public.challenges c on c.id=q.challenge_id where c.room_id=p_room and q.user_id=rm.user_id)
 from public.room_members rm join public.profiles p on p.id=rm.user_id where rm.room_id=p_room;
end;
$$;
revoke all on function public.cf_progress(uuid) from public, anon;
grant execute on function public.cf_progress(uuid) to authenticated;

commit;
