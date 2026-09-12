-- The shared access migration grants UPDATE on individual columns. Revoking
-- table privileges in the challenge migration does not revoke those grants.
-- Keep challenge mutations exclusively behind the membership-checked RPCs.
begin;

revoke update (session_id, type, topic_id, status)
  on public.challenges from public, anon, authenticated;
revoke update (assigned_to, clue_text, revealed, order_index)
  on public.challenge_clues from public, anon, authenticated;

commit;
