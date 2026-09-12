-- Run against a disposable/local database with all five migrations applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
-- The test transaction rolls back every fixture and leaves no test users behind.
begin;
set local plpgsql.check_asserts = on;

insert into auth.users (id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003');

create temporary table campfire_test_ids (name text primary key, value text);
grant all on campfire_test_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
insert into public.profiles (id, display_name)
values (auth.uid(), 'Alice') on conflict (id) do nothing;
insert into public.profiles (id, display_name)
values (auth.uid(), 'Must not overwrite Alice') on conflict (id) do nothing;

do $$ begin
  assert (select display_name = 'Alice' from public.profiles where id = auth.uid()),
    'First-login profile insert must be idempotent';
  begin
    insert into public.profiles (id, display_name)
    values ('10000000-0000-0000-0000-000000000002', 'Impersonated');
    raise exception 'FAIL: inserted someone else''s profile';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_room('   ');
    raise exception 'FAIL: accepted an empty room name';
  exception when invalid_parameter_value then null; end;
end $$;

insert into campfire_test_ids values ('room_a', public.create_room('  Biology  ', 'Science', null)::text);
insert into campfire_test_ids
select 'code_a', join_code from public.rooms where name = 'Biology';

do $$ begin
  assert (select count(*) = 1 from public.room_members), 'Room creation must add its owner';
  assert (select join_code ~ '^[A-F0-9]{10}$' from public.rooms), 'Join code must be random ten-character code';
  assert (select count(*) = 0 from public.leaderboard), 'Original view has no rows without topics';
  begin
    insert into public.room_members (room_id, user_id)
    values ((select value::uuid from campfire_test_ids where name = 'room_a'), auth.uid());
    raise exception 'FAIL: direct membership insertion was allowed';
  exception when insufficient_privilege then null; end;
end $$;

do $$ begin
  begin
    insert into public.syllabus_topics (room_id, title, status)
    values ((select value::uuid from campfire_test_ids where name = 'room_a'), 'Forged verification', 'verified');
    raise exception 'FAIL: client forged verified status';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.syllabus_topics (room_id, title)
values ((select value::uuid from campfire_test_ids where name = 'room_a'), 'Cells');
do $$ begin
  begin
    update public.syllabus_topics set status = 'verified' where title = 'Cells';
    raise exception 'FAIL: client updated verification';
  exception when insufficient_privilege then null; end;
end $$;
-- Simulate the authorized API's service-role write for the leaderboard fixture.
reset role;
update public.syllabus_topics set status = 'verified', last_taught_by = '10000000-0000-0000-0000-000000000001'
where room_id = (select value::uuid from campfire_test_ids where name = 'room_a') and title = 'Cells';
set local role authenticated;
insert into public.syllabus_topics (room_id, title)
values ((select value::uuid from campfire_test_ids where name = 'room_a'), 'Genetics');
insert into public.sessions (id, room_id)
values ('20000000-0000-0000-0000-000000000001', (select value::uuid from campfire_test_ids where name = 'room_a'));
insert into public.session_presence (session_id, user_id)
values ('20000000-0000-0000-0000-000000000001', auth.uid());

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
insert into public.profiles (id, display_name) values (auth.uid(), 'Bob');

do $$ begin
  assert (select count(*) = 0 from public.rooms), 'Nonmember must not see rooms';
  assert (select count(*) = 0 from public.room_members), 'Nonmember must not see memberships';
  assert (select count(*) = 0 from public.syllabus_topics), 'Nonmember must not see topics';
  assert (select count(*) = 0 from public.sessions), 'Nonmember must not see sessions';
  assert (select count(*) = 0 from public.session_presence), 'Nonmember must not see presence';
  assert (select count(*) = 0 from public.leaderboard), 'View must respect RLS';
  assert (select count(*) = 1 from public.profiles), 'Unrelated profiles must not be visible';
  begin
    insert into public.sessions (room_id)
    values ((select value::uuid from campfire_test_ids where name = 'room_a'));
    raise exception 'FAIL: nonmember inserted a session';
  exception when insufficient_privilege then null; end;
  begin
    perform public.join_room('INVALID');
    raise exception 'FAIL: invalid room code was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

insert into campfire_test_ids values ('room_b', public.create_room('Chemistry')::text);
insert into public.sessions (id, room_id)
values ('20000000-0000-0000-0000-000000000002', (select value::uuid from campfire_test_ids where name = 'room_b'));
insert into public.syllabus_topics (id, room_id, title)
values ('30000000-0000-0000-0000-000000000002', (select value::uuid from campfire_test_ids where name = 'room_b'), 'Atoms');

select public.join_room('  ' || lower((select value from campfire_test_ids where name = 'code_a')) || ' ');
select public.join_room((select value from campfire_test_ids where name = 'code_a'));

do $$ begin
  assert (select count(*) = 2 from public.profiles), 'Room peers must see one another''s profiles';
  assert (select count(*) = 2 from public.room_members where room_id = (select value::uuid from campfire_test_ids where name = 'room_a')),
    'Joining twice must not duplicate membership';
  assert (select count(*) = 2 from public.leaderboard
    where room_id = (select value::uuid from campfire_test_ids where name = 'room_a') and verified_count = 1 and total_topics = 2),
    'Preserve original per-room aggregation for each member';
  update public.rooms set name = 'Hijacked'
  where id = (select value::uuid from campfire_test_ids where name = 'room_a');
  assert not found, 'Only the creator can edit room details';
  update public.profiles set display_name = 'Impersonated'
  where id = '10000000-0000-0000-0000-000000000001';
  assert not found, 'Only the profile owner can edit their name';
  begin
    insert into public.challenges (room_id, session_id, type)
    values ((select value::uuid from campfire_test_ids where name = 'room_a'), '20000000-0000-0000-0000-000000000002', 'recall');
    raise exception 'FAIL: cross-room session reference accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.challenges (room_id, topic_id, type)
    values ((select value::uuid from campfire_test_ids where name = 'room_a'), '30000000-0000-0000-0000-000000000002', 'recall');
    raise exception 'FAIL: cross-room topic reference accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.sessions set room_id = (select value::uuid from campfire_test_ids where name = 'room_b')
    where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: session parent room could be changed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.syllabus_topics (room_id, title, last_taught_by)
    values ((select value::uuid from campfire_test_ids where name = 'room_b'), 'Cross-room teacher', '10000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: teacher outside the topic room accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.session_presence (session_id, user_id)
    values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: presence impersonation accepted';
  exception when insufficient_privilege then null; end;
  update public.session_presence set phone_state = 'down'
  where user_id = '10000000-0000-0000-0000-000000000001';
  assert not found, 'Another member must not update Alice''s presence';
end $$;

insert into public.session_presence (session_id, user_id, phone_state)
values ('20000000-0000-0000-0000-000000000001', auth.uid(), 'down');
update public.session_presence set phone_state = 'up', updated_at = now()
where session_id = '20000000-0000-0000-0000-000000000001' and user_id = auth.uid();

-- Challenge clients must use RPCs. Seed these visibility fixtures as the test
-- owner, then return to Bob's authenticated role for all access assertions.
reset role;
insert into public.challenges (id, room_id, session_id, type)
values ('40000000-0000-0000-0000-000000000001', (select value::uuid from campfire_test_ids where name = 'room_a'), '20000000-0000-0000-0000-000000000001', 'recall');
insert into public.challenge_clues (challenge_id, assigned_to, clue_text)
values ('40000000-0000-0000-0000-000000000001', auth.uid(), 'Study cells');
set local role authenticated;

do $$ begin
  assert (select count(*) = 1 from public.challenge_clues), 'Assignee must see their own clue';
  begin
    insert into public.challenges (room_id, session_id, type)
    values ((select value::uuid from campfire_test_ids where name = 'room_a'), '20000000-0000-0000-0000-000000000001', 'recall');
    raise exception 'FAIL: direct challenge insertion accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.challenges set status = 'solved'
    where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: direct challenge status update accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.challenge_clues set clue_text = 'Changed'
    where challenge_id = '40000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: direct clue update accepted';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
do $$ begin
  assert (select count(*) = 1 from public.challenges), 'Room peer must see challenge metadata';
  assert (select count(*) = 0 from public.challenge_clues), 'Room peer must not see another member''s clue';
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
do $$ begin
  begin
    perform public.create_room('Missing profile');
    raise exception 'FAIL: room creation without profile was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;
insert into public.profiles (id, display_name) values (auth.uid(), 'Casey');
do $$ begin
  assert (select count(*) = 0 from public.challenges), 'Outsider must not see challenges';
  assert (select count(*) = 0 from public.challenge_clues), 'Outsider must not see clues';
  assert (select count(*) = 0 from public.leaderboard), 'Outsider must not see leaderboard';
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$ begin
  begin
    update public.challenges set session_id = '20000000-0000-0000-0000-000000000002'
    where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: challenge update accepted cross-room session';
  exception when insufficient_privilege then null; end;
  begin
    update public.challenge_clues set assigned_to = '10000000-0000-0000-0000-000000000003'
    where challenge_id = '40000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: clue update accepted outsider assignment';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.challenge_clues (challenge_id, assigned_to, clue_text)
    values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'No cross-room assignment');
    raise exception 'FAIL: clue assigned to an outsider';
  exception when insufficient_privilege then null; end;
  delete from public.room_members
  where user_id = '10000000-0000-0000-0000-000000000001';
  assert not found, 'Members cannot remove other members';
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
delete from public.room_members where user_id = auth.uid();
do $$ begin
  assert (select count(*) = 0 from public.rooms), 'Leaving removes room access';
  assert (select count(*) = 0 from public.leaderboard), 'Leaving removes view access';
  assert (select count(*) = 1 from public.profiles), 'Own profile remains readable after leaving';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform public.create_room('No JWT subject');
    raise exception 'FAIL: RPC accepted a missing JWT subject';
  exception when invalid_authorization_specification then null; end;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform * from public.leaderboard;
    raise exception 'FAIL: unauthenticated leaderboard read accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_room('Unauthenticated');
    raise exception 'FAIL: unauthenticated RPC accepted';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
rollback;
select 'Campfire migration/RLS checks passed; all fixtures rolled back.' as result;
