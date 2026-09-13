begin;
alter table public.challenges add column if not exists shared_question boolean not null default false;
create or replace function public.cf_save_shared_question(p_room uuid,p_session uuid,p_user uuid,p_topic uuid,p_question text,p_answer text)
returns uuid language plpgsql security definer set search_path='' as $$
declare roster uuid[]; cid uuid; pid text; topic_title text; uid uuid;
begin
 if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_user) then raise exception 'Join this room.'; end if;
 perform 1 from public.sessions where id=p_session and room_id=p_room and is_active and ended_at is null for update;
 if not found then raise exception 'Session ended.'; end if;
 select array_agg(sp.user_id order by sp.user_id) into roster from public.session_presence sp join public.room_members rm on rm.room_id=p_room and rm.user_id=sp.user_id where sp.session_id=p_session;
 if coalesce(cardinality(roster),0) not between 1 and 6 or p_user is null or not p_user=any(roster) then raise exception 'Join a session with 1–6 players.'; end if;
 select title into topic_title from public.syllabus_topics where id=p_topic and room_id=p_room;
 if not found then raise exception 'Select a syllabus topic from this room.'; end if;
 if p_question is null or length(trim(p_question)) not between 1 and 2100 or p_answer is null or length(trim(p_answer)) not between 1 and 160 then raise exception 'Invalid question.'; end if;
 select id into cid from public.challenges where session_id=p_session and status='active' and type='split_puzzle' and shared_question;
 if cid is not null then return cid; end if;
 -- An explicit start replaces obsolete hint rounds only, never an unfinished shared question.
 update public.challenges set status='cancelled' where session_id=p_session and status='active' and type='split_puzzle' and not shared_question;
 pid:='generated:shared:'||gen_random_uuid()::text;
 insert into cf_private.puzzles(id,title,prompt,clues,answers) values(pid,topic_title,p_question,array_fill('Unused'::text,array[6]),array['unused']);
 insert into public.challenges(room_id,session_id,topic_id,type,status,title,prompt,shared_question) values(p_room,p_session,p_topic,'split_puzzle','active',topic_title,p_question,true) returning id into cid;
 insert into cf_private.rounds values(cid,pid,roster);
 foreach uid in array roster loop
  insert into cf_private.individual_questions(challenge_id,user_id,question,answer) values(cid,uid,p_question,lower(regexp_replace(trim(p_answer),'\s+','','g')));
 end loop;
 return cid;
end; $$;
revoke all on function public.cf_save_shared_question(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.cf_save_shared_question(uuid,uuid,uuid,uuid,text,text) to service_role;
alter function public.cf_snapshot(uuid,uuid) rename to cf_snapshot_before_shared_question;
revoke all on function public.cf_snapshot_before_shared_question(uuid,uuid) from public,anon,authenticated;
create function public.cf_snapshot(p_room uuid,p_session uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; shared boolean;
begin
 result:=public.cf_snapshot_before_shared_question(p_room,p_session);
 select shared_question into shared from public.challenges where id=(result->'challenge'->>'id')::uuid;
 if shared then result:=jsonb_set(result,'{challenge}',result->'challenge'||jsonb_build_object('shared_question',true,'prompt',(select prompt from public.challenges where id=(result->'challenge'->>'id')::uuid),'assistance_hint',null,'penalty_points',0)); end if;
 return result;
end; $$;
revoke all on function public.cf_snapshot(uuid,uuid) from public,anon;
grant execute on function public.cf_snapshot(uuid,uuid) to authenticated;
alter function public.cf_submit(uuid,uuid,text) rename to cf_submit_before_shared_question;
revoke all on function public.cf_submit_before_shared_question(uuid,uuid,text) from public,anon,authenticated;
create function public.cf_submit(p_room uuid,p_session uuid,p_answer text) returns boolean language plpgsql security definer set search_path='' as $$
declare result boolean;
begin
 result:=public.cf_submit_before_shared_question(p_room,p_session,p_answer);
 update cf_private.individual_questions q set penalty_points=0 from public.challenges c where c.id=q.challenge_id and c.room_id=p_room and c.session_id=p_session and c.shared_question and q.user_id=auth.uid();
 return result;
end; $$;
revoke all on function public.cf_submit(uuid,uuid,text) from public,anon;
grant execute on function public.cf_submit(uuid,uuid,text) to authenticated;
commit;
