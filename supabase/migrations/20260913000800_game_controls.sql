begin;
create or replace function public.cf_game_snapshot(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.challenges; s cf_private.game_state; r public.game_rounds; total int; ready boolean; result jsonb;
begin
 if not public.cf_is_member(p_room) then raise exception 'Join this room.'; end if;
 select * into c from public.challenges where room_id=p_room and type in ('trivia','mystery_voice','two_truths') order by created_at desc,id desc limit 1 for update;
 if c.id is null then return null; end if;
 select * into s from cf_private.game_state where challenge_id=c.id;
 if c.type='mystery_voice' then
  select count(*) into total from public.challenge_clues where challenge_id=c.id;
  if c.status='active' and now()>=s.deadline then
   if s.current_index+1>=total then s.phase:='finished';c.status:='solved';
   else s.current_index:=s.current_index+1;s.deadline:=now()+interval '15 seconds';update public.challenge_clues set revealed=true where challenge_id=c.id and order_index=s.current_index; end if;
  end if;
 else
  select count(*) into total from public.game_rounds where challenge_id=c.id;
  select * into r from public.game_rounds where challenge_id=c.id and round_index=s.current_index;
  select count(*)>=cardinality(s.participants) into ready from public.game_answers where round_id=r.id;
  if c.status='active' and s.phase='question' and ((c.type<>'trivia' and now()>=s.deadline) or ready) then s.phase:='reveal';s.deadline:=case when c.type='trivia' then 'infinity'::timestamptz else now()+interval '8 seconds' end;
  elsif c.status='active' and s.phase='reveal' and now()>=s.deadline then
   if s.current_index+1>=total then s.phase:='finished';c.status:='solved';
   else s.current_index:=s.current_index+1;s.phase:='question';s.deadline:=now()+make_interval(secs=>case c.type when 'two_truths' then 40 else 20 end);select * into r from public.game_rounds where challenge_id=c.id and round_index=s.current_index;end if;
  end if;
 end if;
 update cf_private.game_state set current_index=s.current_index,phase=s.phase,deadline=s.deadline where challenge_id=c.id and (current_index,phase,deadline) is distinct from (s.current_index,s.phase,s.deadline);
 if found then update public.challenges set status=c.status,attempts=attempts+1 where id=c.id;end if;
 result:=jsonb_build_object('id',c.id,'type',c.type,'title',c.title,'phase',s.phase,'deadline',s.deadline,'server_now',now(),'round_index',s.current_index,'total',total,'participants',s.participants,'winner',s.winner,
 'players',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'score',(select count(*) from public.game_answers a join public.game_rounds g on g.id=a.round_id where g.challenge_id=c.id and a.user_id=p.id and a.is_correct and (g.round_index<s.current_index or s.phase<>'question')))), '[]'::jsonb) from public.profiles p where p.id=any(s.participants)));
 if c.type='mystery_voice' then
  return result||jsonb_build_object('answer',case when s.phase='finished' then s.answer end,'clues',(select jsonb_agg(jsonb_build_object('id',id,'text',clue_text,'audio_cached',audio_url is not null,'order_index',order_index) order by order_index) from public.challenge_clues where challenge_id=c.id and revealed));
 end if;
 return result||jsonb_build_object('round',jsonb_build_object('id',r.id,'prompt',r.prompt_text,'options',r.options,'correct',case when s.phase<>'question' then r.correct_option_index end,'explanation',case when s.phase<>'question' then r.explanation end),
 'answers',(select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'selected',selected_option_index,'correct',case when s.phase<>'question' then is_correct end)),'[]'::jsonb) from public.game_answers where round_id=r.id and (user_id=auth.uid() or s.phase<>'question')));
end; $$;
revoke all on function public.cf_game_snapshot(uuid) from public,anon;
grant execute on function public.cf_game_snapshot(uuid) to authenticated;

create or replace function public.cf_game_answer(p_room uuid,p_round uuid,p_option int) returns void language plpgsql security definer set search_path='' as $$
declare c public.challenges; s cf_private.game_state; r public.game_rounds;
begin
 if not public.cf_is_member(p_room) then raise exception 'Join this room.';end if;
 select * into r from public.game_rounds where id=p_round;
 select * into c from public.challenges where id=r.challenge_id and room_id=p_room for update;
 select * into s from cf_private.game_state where challenge_id=c.id;
 if c.id is null or c.status<>'active' or s.phase<>'question' or (c.type<>'trivia' and now()>=s.deadline) or s.current_index<>r.round_index or not auth.uid()=any(s.participants) then raise exception 'This round is closed or you joined after it started.';end if;
 if p_option is null or p_option<0 or p_option>=jsonb_array_length(r.options) then raise exception 'Invalid option.';end if;
 insert into public.game_answers(round_id,user_id,selected_option_index,is_correct) values(r.id,auth.uid(),p_option,p_option=r.correct_option_index) on conflict(round_id,user_id) do nothing;
 update public.challenges set attempts=attempts+1 where id=c.id;
end; $$;
revoke all on function public.cf_game_answer(uuid,uuid,int) from public,anon;
grant execute on function public.cf_game_answer(uuid,uuid,int) to authenticated;

create or replace function public.cf_game_control(p_room uuid,p_game uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare c public.challenges;s cf_private.game_state;
begin
 if not public.cf_is_member(p_room) then raise exception 'Join this room.';end if;
 select * into c from public.challenges where id=p_game and room_id=p_room and type in ('trivia','two_truths','mystery_voice') for update;
 select * into s from cf_private.game_state where challenge_id=c.id;
 if c.id is null or c.status<>'active' or not auth.uid()=any(s.participants) then raise exception 'This game is closed or you joined late.';end if;
 if p_action='end_game' then
  update cf_private.game_state set phase='finished' where challenge_id=c.id;
  update public.challenges set status='cancelled',attempts=attempts+1 where id=c.id;
 elsif c.type='trivia' and p_action='end_question' and s.phase='question' then
  update cf_private.game_state set phase='reveal',deadline='infinity'::timestamptz where challenge_id=c.id;
  update public.challenges set attempts=attempts+1 where id=c.id;
 elsif c.type='trivia' and p_action='next' and s.phase='reveal' then
  update cf_private.game_state set deadline=now()-interval '1 second' where challenge_id=c.id;
  perform public.cf_game_snapshot(p_room);
 else raise exception 'This action is not available.';end if;
end; $$;
revoke all on function public.cf_game_control(uuid,uuid,text) from public,anon;
grant execute on function public.cf_game_control(uuid,uuid,text) to authenticated;

commit;
