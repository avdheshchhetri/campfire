-- Pair a secondary phone with an existing profile without copying its Supabase
-- login. Only these narrowly scoped RPCs can read or change pairing records.
begin;

alter table public.profiles add column if not exists avatar_url text;

create table if not exists public.paired_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) not null,
  device_label text,
  pairing_code text unique not null,
  local_token text unique,
  paired_at timestamp,
  created_at timestamp default now()
);

alter table public.paired_devices enable row level security;
revoke all on public.paired_devices from public, anon, authenticated;
-- There are deliberately no table policies or browser grants. A phone token is
-- a capability for the token RPCs below, never a Supabase authentication token.
grant update (avatar_url) on public.profiles to authenticated;

create or replace function public.create_device_pair(p_label text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_pair public.paired_devices;
  v_code text;
  v_bytes bytea;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt integer;
  v_index integer;
begin
  if v_user is null then
    raise exception 'Sign in before pairing a phone.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'Create your profile before pairing a phone.' using errcode = '28000';
  end if;
  if length(btrim(p_label)) > 80 then
    raise exception 'Use a device label of at most 80 characters.' using errcode = '22023';
  end if;

  for v_attempt in 1..10 loop
    -- The first six UUID bytes precede its fixed version/variant bits. Omit
    -- ambiguous I, O, 0 and 1 so the code is easy to enter on another device.
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    for v_index in 0..5 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_index) % length(v_alphabet)) + 1, 1);
    end loop;
    begin
      insert into public.paired_devices (user_id, device_label, pairing_code)
      values (v_user, nullif(btrim(p_label), ''), v_code)
      returning * into v_pair;
      return jsonb_build_object('id', v_pair.id, 'pairing_code', v_pair.pairing_code, 'created_at', v_pair.created_at);
    exception when unique_violation then
      if v_attempt = 10 then
        raise exception 'Could not create a pairing code. Please try again.';
      end if;
    end;
  end loop;
end;
$$;

create or replace function public.claim_device_pair(p_code text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_pair public.paired_devices;
  v_token text := lower(p_token);
begin
  if v_token is null or v_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid device token. Please restart phone pairing.' using errcode = '22023';
  end if;
  -- Serializing on the code makes a claim one-time even for simultaneous calls.
  select * into v_pair from public.paired_devices
  where pairing_code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'Pairing code is invalid or expired. Get a new code on your main device.' using errcode = '22023';
  end if;

  if v_pair.local_token is not null then
    if v_pair.local_token <> v_token then
      raise exception 'This pairing code has already been used. Get a new code on your main device.' using errcode = '22023';
    end if;
    -- The same phone can safely retry if its first response was lost. A claimed
    -- device remains paired after the short-lived code's original expiry time.
  else
    if v_pair.created_at is null or v_pair.created_at < (now() - interval '15 minutes') then
      raise exception 'Pairing code is invalid or expired. Get a new code on your main device.' using errcode = '22023';
    end if;
    begin
      update public.paired_devices set local_token = v_token, paired_at = now()
      where id = v_pair.id;
    exception when unique_violation then
      raise exception 'This phone token is already paired. Restart pairing to use a different profile.' using errcode = '22023';
    end;
  end if;

  return (select jsonb_build_object('user_id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url)
    from public.profiles p where p.id = v_pair.user_id);
end;
$$;

create or replace function public.resolve_device_pair(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_pair public.paired_devices;
  v_token text := lower(p_token);
begin
  if v_token is null or v_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Phone is not paired. Pair it again from your main device.' using errcode = '28000';
  end if;
  select * into v_pair from public.paired_devices
  where local_token = v_token and paired_at is not null;
  if not found then
    raise exception 'Phone is not paired. Pair it again from your main device.' using errcode = '28000';
  end if;

  return (select jsonb_build_object(
    'device_id', v_pair.id, 'user_id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'room_id', s.room_id, 'room_name', r.name, 'started_at', s.started_at)
        order by s.started_at desc, s.id)
      from public.sessions s
      join public.rooms r on r.id = s.room_id
      join public.room_members rm on rm.room_id = s.room_id and rm.user_id = v_pair.user_id
      where s.is_active = true and s.ended_at is null
    ), '[]'::jsonb)
  ) from public.profiles p where p.id = v_pair.user_id);
end;
$$;

create or replace function public.set_device_presence(p_token text, p_session_id uuid, p_state text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_token text := lower(p_token);
begin
  if v_token is null or v_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Phone is not paired. Pair it again from your main device.' using errcode = '28000';
  end if;
  select user_id into v_user from public.paired_devices
  where local_token = v_token and paired_at is not null;
  if not found then
    raise exception 'Phone is not paired. Pair it again from your main device.' using errcode = '28000';
  end if;
  if p_state is null or p_state not in ('up', 'down') then
    raise exception 'Phone state must be up or down.' using errcode = '22023';
  end if;
  -- Lock the active session and membership until the write commits. Ending a
  -- session or removing membership cannot race past the authorization check.
  perform 1 from public.sessions s
  join public.room_members rm on rm.room_id = s.room_id and rm.user_id = v_user
  where s.id = p_session_id and s.is_active = true and s.ended_at is null
  for share of s, rm;
  if not found then
    raise exception 'This session has ended or your profile is not a room member.' using errcode = '42501';
  end if;
  insert into public.session_presence (session_id, user_id, phone_state, updated_at)
  values (p_session_id, v_user, p_state, now())
  on conflict (session_id, user_id) do update
    set phone_state = excluded.phone_state, updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.create_device_pair(text), public.claim_device_pair(text,text),
  public.resolve_device_pair(text), public.set_device_presence(text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.create_device_pair(text) to authenticated;
grant execute on function public.claim_device_pair(text,text), public.resolve_device_pair(text),
  public.set_device_presence(text,uuid,text) to anon, authenticated;

-- A local PostgreSQL test database need not have the Supabase publication.
-- Reapplying this migration must not add an already-published table twice.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions') then
      alter publication supabase_realtime add table public.sessions;
    end if;
    if not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_presence') then
      alter publication supabase_realtime add table public.session_presence;
    end if;
  end if;
end $$;

commit;
