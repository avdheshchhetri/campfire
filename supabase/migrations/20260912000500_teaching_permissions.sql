-- Keep the shared table/column schema unchanged. Gemini verification is written
-- only by the authenticated server route after checking room membership.
begin;
revoke update, delete on public.syllabus_topics from authenticated;
revoke update (title, order_index, status, last_taught_by, last_taught_at)
  on public.syllabus_topics from authenticated;
create policy syllabus_initial_state on public.syllabus_topics
  as restrictive for insert to authenticated
  with check (status = 'untouched' and last_taught_by is null and last_taught_at is null);
-- Service role bypasses RLS but still needs table privileges.
grant select, update (status, last_taught_by, last_taught_at)
  on public.syllabus_topics to service_role;
commit;
