# 🔥 Campfire

**A little focus. A little company.**

Campfire is a study-room app built for HackWesTX 2026 (theme: *Beyond the Feed*). Instead of scrolling, groups gather in a shared room, teach each other the syllabus out loud, and let an AI keep score of what's actually been covered — while your phone, not your laptop, is the thing that has to go face-down.

---

## The idea

Students fall behind on syllabus coverage before exams, and study sessions get eaten by phones. Campfire fixes both at once:

- **Teach it to prove you know it.** Explaining a topic out loud (the Feynman technique) is one of the best ways to actually learn it — but nothing tracks whether you've really covered your syllabus until it's too late. Campfire does.
- **Your phone is the distraction, not your laptop.** Most focus apps make you put away the device you're trying to work on. Campfire flips that: your laptop is where the studying happens, and your phone — paired once as your personal "distraction device" — is the only thing that has to stay face-down for the group's session timer to run.

---

## Features

**📚 Syllabus + AI Teach-Back Tracker**
Upload or paste a syllabus (including PDFs). An AI breaks it into topics. Teach a topic in your own words, answer a follow-up question, and the AI marks it `untouched` → `taught` → `verified` on a live coverage dashboard. If an exam is coming up and you're behind, you'll know.

**🔥 Campfire Mode**
Start a session and pair your phone as your distraction device. The group's shared timer only runs while every paired phone is face-down — flip one up, and it's flagged by name on the group's screen until it goes back down.

**🧩 Challenge Engine**
Mid-session puzzles generated from your own syllabus, split into pieces so no one person can solve it alone — clues are handed to different teammates and rotate as hints are used, forcing the group to actually talk it out.

**🎮 Games** *(Spark Round, The Ember Riddle, Two Truths One Lie — see below)*

**🗂️ Flashcards**
AI-generated flashcards from your syllabus topics, browsable anytime in a room.

**🏆 Leaderboard**
Tracks verified syllabus coverage per person, per room — not just who showed up, who actually learned it.

**👤 Profiles & Device Pairing**
Guest profiles with avatars, plus a pairing-code flow that lets your phone "borrow" your laptop's identity for orientation tracking only — no separate login needed for your phone.

**🌗 Light/Dark Theme**
Dark by default; a white-and-blue light theme is available via a toggle in the nav.

---

## Sponsor tracks

| Track | Status |
|---|---|
| Best Use of Gemini API | ✅ Built — powers syllabus parsing / challenge generation |
| Best Use of ElevenLabs | 🚧 In progress — spoken AI follow-up questions, session recaps, and The Ember Riddle game |
| Best Use of Auth0 | 🤔 Maybe — optional upgrade to the main-device login flow |
| Best Use of Solana | ⏸️ Parked — devnet completion certificates, lowest priority |
| Best .Tech Domain | — |

*(Trim or update this table before final submission to reflect what actually shipped.)*

---

## Tech stack

- **Frontend:** React + Vite, Tailwind CSS
- **Backend/Data:** Supabase (Postgres, Auth, Realtime, Storage)
- **AI:** Claude & Gemini (syllabus parsing, teach-back verification, challenge/game generation)
- **Voice:** ElevenLabs
- **Deployment:** Vercel
- **Package manager:** pnpm

---

## Getting started

### Prerequisites
- Node.js
- pnpm
- A Supabase project (see below)

### 1. Clone and install
```bash
git clone https://github.com/avdheshchhetri/campfire.git
cd campfire
pnpm install
```

### 2. Set up Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the schema below to create all tables.
3. For hackathon purposes, disable Row Level Security on every table (`alter table <name> disable row level security;`) so reads/writes aren't silently blocked.
4. Copy your Project URL and anon public key from Project Settings → API.

### 3. Environment variables
Create a `.env.local` file:
```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
CLAUDE_API_KEY=your-claude-key
GEMINI_API_KEY=your-gemini-key
ELEVENLABS_API_KEY=your-elevenlabs-key
```
**Important:** these same values also need to be added in your Vercel project's dashboard under Settings → Environment Variables — `.env.local` only powers your local dev server, not the deployed site.

### 4. Run locally
```bash
pnpm dev
```

### 5. Deploy
Push to `main` — if the repo is connected to Vercel, it deploys automatically. Otherwise, import the repo at [vercel.com](https://vercel.com) and add the environment variables from step 3.

---

## Database schema

```sql
create table profiles (
  id uuid references auth.users primary key,
  display_name text not null,
  avatar_url text,
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
  type text not null, -- 'split_puzzle' | 'trivia' | 'mystery_voice' | 'two_truths'
  topic_id uuid references syllabus_topics(id),
  status text default 'active',
  created_at timestamp default now()
);

create table challenge_clues (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references challenges(id),
  assigned_to uuid references profiles(id), -- null = visible to whole room
  clue_text text not null,
  audio_url text,
  revealed boolean default true,
  order_index int
);

create table game_rounds (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references challenges(id),
  round_index int,
  prompt_text text not null,
  options jsonb not null,
  correct_option_index int not null,
  created_at timestamp default now()
);

create table game_answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references game_rounds(id),
  user_id uuid references profiles(id),
  selected_option_index int,
  is_correct boolean,
  answered_at timestamp default now()
);

create table flashcards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id),
  topic_id uuid references syllabus_topics(id),
  front_text text not null,
  back_text text not null,
  created_at timestamp default now()
);

create table paired_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  device_label text,
  pairing_code text unique not null,
  local_token text unique,
  paired_at timestamp,
  created_at timestamp default now()
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
```

---

## Team

Built by a team of 4 at HackWesTX 2026.

---

*You don't have to figure everything out alone.*
