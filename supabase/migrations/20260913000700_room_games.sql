begin;
alter table public.challenge_clues add column if not exists audio_url text;
create table if not exists public.game_rounds (
 id uuid primary key default gen_random_uuid(), challenge_id uuid not null references public.challenges(id) on delete cascade,
 round_index int not null, prompt_text text not null, options jsonb not null, correct_option_index int not null,
 explanation text not null default '', created_at timestamp default now(), unique(challenge_id,round_index),
 check(jsonb_typeof(options)='array'), check(correct_option_index>=0 and correct_option_index<jsonb_array_length(options))
);
create table if not exists public.game_answers (
 id uuid primary key default gen_random_uuid(), round_id uuid not null references public.game_rounds(id) on delete cascade,
 user_id uuid not null references public.profiles(id), selected_option_index int, is_correct boolean,
 answered_at timestamp default now(), unique(round_id,user_id)
);
create table if not exists public.flashcards (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms(id) on delete cascade,
 topic_id uuid not null references public.syllabus_topics(id) on delete cascade,
 front_text text not null, back_text text not null, created_at timestamp default now()
);
alter table public.game_rounds add column if not exists explanation text not null default '';
create unique index if not exists game_rounds_one_index on public.game_rounds(challenge_id,round_index);
create unique index if not exists game_answers_one_vote on public.game_answers(round_id,user_id);
-- Answer-bearing tables are accessed through checked snapshots, never SELECT * in the browser.
alter table public.game_rounds enable row level security;
alter table public.game_answers enable row level security;
alter table public.flashcards enable row level security;
revoke all on public.game_rounds,public.game_answers,public.flashcards from public,anon,authenticated;
grant select on public.flashcards to authenticated;
create policy flashcards_room_read on public.flashcards for select to authenticated using(public.cf_is_member(room_id));
create table cf_private.game_state (
 challenge_id uuid primary key references public.challenges(id) on delete cascade, participants uuid[] not null,
 current_index int not null default 0, phase text not null default 'question', deadline timestamptz not null,
 answer text, winner uuid references public.profiles(id), last_guesses jsonb not null default '{}'
);
create table cf_private.game_audio_leases(clue_id uuid primary key references public.challenge_clues(id) on delete cascade, expires_at timestamptz not null);
-- No type constraint exists in the shared schema: the new types are validated by the game save function.
create or replace function public.cf_save_room_game(p_room uuid,p_user uuid,p_type text,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare cid uuid; roster uuid[]; item jsonb; i int:=0; title text;
begin
 perform 1 from public.rooms where id=p_room for update;
 if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_user) then raise exception 'Join this room.'; end if;
 if p_type not in ('trivia','mystery_voice','two_truths') then raise exception 'Unknown game.'; end if;
 select id into cid from public.challenges where room_id=p_room and type in ('trivia','mystery_voice','two_truths') and status='active' limit 1;
 if cid is not null then return cid; end if;
 select array_agg(user_id order by user_id) into roster from public.room_members where room_id=p_room;
 if p_type='mystery_voice' then
  select t.title into title from public.syllabus_topics t where t.room_id=p_room and t.id=(p_payload->>'topic_id')::uuid and t.status in ('taught','verified');
  if not found or jsonb_array_length(p_payload->'clues') not between 3 and 4 then raise exception 'Invalid riddle.'; end if;
 else
  if jsonb_array_length(p_payload->'rounds')<>5 then raise exception 'Expected five rounds.'; end if;
 end if;
 insert into public.challenges(room_id,type,status,title,prompt) values(p_room,p_type,'active',case p_type when 'trivia' then 'Spark Round' when 'two_truths' then 'Two Truths, One Lie' else 'The Ember Riddle' end,'') returning id into cid;
 insert into cf_private.game_state(challenge_id,participants,deadline,answer) values(cid,roster,now()+make_interval(secs=>case p_type when 'two_truths' then 40 when 'mystery_voice' then 15 else 20 end),title);
 if p_type='mystery_voice' then
  for item in select value from jsonb_array_elements(p_payload->'clues') loop
   insert into public.challenge_clues(challenge_id,assigned_to,clue_text,revealed,order_index) values(cid,null,item#>>'{}',i=0,i); i:=i+1;
  end loop;
 else
  for item in select value from jsonb_array_elements(p_payload->'rounds') loop
   insert into public.game_rounds(challenge_id,round_index,prompt_text,options,correct_option_index,explanation) values(cid,i,item->>'prompt_text',item->'options',(item->>'correct_option_index')::int,item->>'explanation'); i:=i+1;
  end loop;
 end if;
 return cid;
end; $$;
revoke all on function public.cf_save_room_game(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cf_save_room_game(uuid,uuid,text,jsonb) to service_role;

create function public.cf_game_snapshot(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if c.status='active' and s.phase='question' and (now()>=s.deadline or ready) then s.phase:='reveal';s.deadline:=now()+interval '8 seconds';
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

create function public.cf_game_answer(p_room uuid,p_round uuid,p_option int) returns void language plpgsql security definer set search_path='' as $$
declare c public.challenges; s cf_private.game_state; r public.game_rounds;
begin
 if not public.cf_is_member(p_room) then raise exception 'Join this room.';end if;
 select * into r from public.game_rounds where id=p_round;
 select * into c from public.challenges where id=r.challenge_id and room_id=p_room for update;
 select * into s from cf_private.game_state where challenge_id=c.id;
 if c.id is null or c.status<>'active' or s.phase<>'question' or now()>=s.deadline or s.current_index<>r.round_index or not auth.uid()=any(s.participants) then raise exception 'This round is closed or you joined after it started.';end if;
 if p_option is null or p_option<0 or p_option>=jsonb_array_length(r.options) then raise exception 'Invalid option.';end if;
 insert into public.game_answers(round_id,user_id,selected_option_index,is_correct) values(r.id,auth.uid(),p_option,p_option=r.correct_option_index) on conflict(round_id,user_id) do nothing;
 update public.challenges set attempts=attempts+1 where id=c.id;
end; $$;
revoke all on function public.cf_game_answer(uuid,uuid,int) from public,anon;
grant execute on function public.cf_game_answer(uuid,uuid,int) to authenticated;

-- Conservative fuzzy matching: case/punctuation/spacing ignored, or one edit for terms >= 6 characters.
create function cf_private.near_term(a text,b text) returns boolean language plpgsql immutable as $$
declare i int:=1;j int:=1;edits int:=0;
begin
 a:=regexp_replace(lower(a),'[^[:alnum:]]','','g');b:=regexp_replace(lower(b),'[^[:alnum:]]','','g');
 if a=b then return true;end if;
 if least(length(a),length(b))<6 or abs(length(a)-length(b))>1 then return false;end if;
 while i<=length(a) and j<=length(b) loop
  if substr(a,i,1)=substr(b,j,1) then i:=i+1;j:=j+1;
  else edits:=edits+1;if edits>1 then return false;end if;if length(a)>=length(b) then i:=i+1;end if;if length(b)>=length(a) then j:=j+1;end if;end if;
 end loop;
 return edits+(length(a)-i+1)+(length(b)-j+1)<=1;
end; $$;
create function public.cf_game_guess(p_room uuid,p_game uuid,p_guess text) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.challenges;s cf_private.game_state;correct boolean;
begin
 if not public.cf_is_member(p_room) then raise exception 'Join this room.';end if;
 select * into c from public.challenges where id=p_game and room_id=p_room and type='mystery_voice' for update;
 select * into s from cf_private.game_state where challenge_id=c.id;
 if c.id is null or c.status<>'active' or not auth.uid()=any(s.participants) then raise exception 'Riddle closed or you joined late.';end if;
 if now()>=s.deadline then raise exception 'Clue changing. Retry in a moment.';end if;
 if p_guess is null or length(trim(p_guess)) not between 1 and 200 then raise exception 'Enter a short guess.';end if;
 if (s.last_guesses->>auth.uid()::text)::timestamptz>now()-interval '3 seconds' then raise exception 'Wait three seconds between guesses.';end if;
 correct:=cf_private.near_term(p_guess,s.answer);
 update cf_private.game_state set last_guesses=last_guesses||jsonb_build_object(auth.uid()::text,now()),winner=case when correct then auth.uid() else winner end,phase=case when correct then 'finished' else phase end where challenge_id=c.id;
 update public.challenges set attempts=attempts+1,status=case when correct then 'solved' else status end where id=c.id;
 return correct;
end; $$;
revoke all on function public.cf_game_guess(uuid,uuid,text) from public,anon;
grant execute on function public.cf_game_guess(uuid,uuid,text) to authenticated;

create function public.cf_save_flashcards(p_room uuid,p_user uuid,p_cards jsonb) returns int language plpgsql security definer set search_path='' as $$
declare item jsonb;n int:=0;
begin
 if not exists(select 1 from public.room_members where room_id=p_room and user_id=p_user) then raise exception 'Join this room.';end if;
 if jsonb_array_length(p_cards) not between 1 and 100 then raise exception 'Invalid card count.';end if;
 for item in select value from jsonb_array_elements(p_cards) loop
  if not exists(select 1 from public.syllabus_topics where id=(item->>'topic_id')::uuid and room_id=p_room) then raise exception 'Topic not in room.';end if;
  if length(trim(item->>'front_text')) not between 1 and 1000 or length(trim(item->>'back_text')) not between 1 and 2000 then raise exception 'Invalid card.';end if;
  insert into public.flashcards(room_id,topic_id,front_text,back_text) values(p_room,(item->>'topic_id')::uuid,item->>'front_text',item->>'back_text');n:=n+1;
 end loop;return n;
end; $$;
revoke all on function public.cf_save_flashcards(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cf_save_flashcards(uuid,uuid,jsonb) to service_role;

-- Extend only revealed room-wide clues; all existing private-clue restrictions remain.
drop policy cf_clues_read on public.challenge_clues;
drop policy cf_clues_boundary on public.challenge_clues;
create policy cf_clues_read on public.challenge_clues for select to authenticated using (
 (assigned_to=auth.uid() and public.cf_can_read_challenge(challenge_id)) or
 (assigned_to is null and revealed and exists(select 1 from public.challenges c where c.id=challenge_id and public.cf_is_member(c.room_id))));
create policy cf_clues_boundary on public.challenge_clues as restrictive for select to authenticated using (
 (assigned_to=auth.uid() and public.cf_can_read_challenge(challenge_id)) or
 (assigned_to is null and revealed and exists(select 1 from public.challenges c where c.id=challenge_id and public.cf_is_member(c.room_id))));
create function public.cf_claim_game_audio(p_clue uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 insert into cf_private.game_audio_leases values(p_clue,now()+interval '35 seconds') on conflict(clue_id) do update set expires_at=excluded.expires_at where cf_private.game_audio_leases.expires_at<now();
 return found;
end; $$;
revoke all on function public.cf_claim_game_audio(uuid) from public,anon,authenticated;
grant execute on function public.cf_claim_game_audio(uuid) to service_role;
-- Existing challenge publication delivers round updates; guarded for local PostgreSQL tests.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='challenges') then alter publication supabase_realtime add table public.challenges;end if;
end $$;
commit;
