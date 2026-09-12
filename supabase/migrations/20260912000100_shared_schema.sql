create table profiles (
  id uuid references auth.users primary key,
  display_name text not null,
  created_at timestamp default now()
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text,
  join_code text unique not null,
  exam_date date,
  created_by uuid references profiles(id),
  created_at timestamp default now()
);

create table room_members (
  room_id uuid references rooms(id),
  user_id uuid references profiles(id),
  primary key (room_id, user_id)
);

create table syllabus_topics (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id),
  title text not null,
  order_index int,
  status text default 'untouched',
  last_taught_by uuid references profiles(id),
  last_taught_at timestamp
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id),
  started_at timestamp default now(),
  ended_at timestamp,
  is_active boolean default true
);

create table session_presence (
  session_id uuid references sessions(id),
  user_id uuid references profiles(id),
  phone_state text default 'up',
  updated_at timestamp default now(),
  primary key (session_id, user_id)
);

create table challenges (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id),
  session_id uuid references sessions(id),
  type text not null,
  topic_id uuid references syllabus_topics(id),
  status text default 'active',
  created_at timestamp default now()
);

create table challenge_clues (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references challenges(id),
  assigned_to uuid references profiles(id),
  clue_text text not null,
  revealed boolean default true,
  order_index int
);

create view leaderboard as
select
  rm.room_id,
  rm.user_id,
  p.display_name,
  count(*) filter (where st.status = 'verified') as verified_count,
  count(*) as total_topics
from room_members rm
join profiles p on p.id = rm.user_id
join syllabus_topics st on st.room_id = rm.room_id
group by rm.room_id, rm.user_id, p.display_name;
