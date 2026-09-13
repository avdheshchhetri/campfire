begin;
alter table public.profiles add column if not exists auth0_id text unique;

-- The server owns identity mappings. Normal self-profile creation remains allowed.
drop policy if exists profiles_auth0_server_insert on public.profiles;
create policy profiles_auth0_server_insert on public.profiles as restrictive
  for insert to authenticated with check (auth0_id is null);
-- Existing column-specific display_name/avatar_key update grants remain unchanged.
-- No authenticated UPDATE grant is added for auth0_id.
commit;
