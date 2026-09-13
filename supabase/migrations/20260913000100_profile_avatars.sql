-- Additive only: existing profile IDs, permissions, and room membership are retained.
alter table public.profiles add column if not exists avatar_key text not null default 'initials'
  check (avatar_key in ('initials', 'flame', 'fox', 'owl', 'rocket', 'leaf', 'star'));
grant update (avatar_key) on public.profiles to authenticated;
-- Existing profiles_update_self and room-scoped profiles_read policies remain in force.
