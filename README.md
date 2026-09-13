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
Mid-session questions generated from your own syllabus. Everyone sees the same question, answers separately, and moves on once all participants answer correctly. Optional ElevenLabs narration sits beside the question. Older hint rounds remain as history; new session quizzes do not distribute teammate clues.

**🎮 Games** *(Spark Round, The Ember Riddle, Two Truths One Lie — see below)*

**🗂️ Flashcards**
AI-generated flashcards from your syllabus topics, browsable anytime in a room.

**🏆 Leaderboard**
Tracks verified syllabus coverage per person, per room — not just who showed up, who actually learned it.

**👤 Profiles & Device Pairing**
Optional Auth0 Universal Login, with Google social sign-in enabled through the Auth0 dashboard. Existing guest/email accounts remain available when Auth0 is not configured. Profiles keep their Supabase UUID and avatar selection. Tabledown opens the phone focus view; sign in on the phone with the same account to use it across devices.

**🌗 Light/Dark Theme**
Dark by default; a white-and-blue light theme is available via a toggle in the nav.

---

## Sponsor tracks

| Track | Status |
|---|---|
| Best Use of Gemini API | ✅ Built — powers syllabus parsing / challenge generation |
| Best Use of ElevenLabs | ✅ Implemented — optional spoken questions, session recaps, and Ember Riddle narration; requires server key and voice access |
| Best Use of Auth0 | ✅ Implemented — Universal Login + UUID session bridge; Google connection and deployment settings still need dashboard setup |
| Best Use of Solana | ⏸️ Parked — devnet completion certificates, lowest priority |
| Best .Tech Domain | — |

*(Trim or update this table before final submission to reflect what actually shipped.)*

---

## Tech stack

- **Frontend:** React + Vite, Tailwind CSS
- **Backend/Data:** Supabase (Postgres, Auth, Realtime, Storage)
- **AI:** Gemini (syllabus parsing, teach-back verification, challenge/game generation)
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
2. Apply all files in [`supabase/migrations/`](supabase/migrations/) in filename order using **SQL Editor → New query → Run**. Existing projects should apply only missing migrations.
3. Keep Row Level Security enabled. The migrations supply the room and identity permissions required by the app. Keep the Supabase Email provider enabled, including when using Auth0.
4. Copy your Project URL and anon/public key from Project Settings → API.

### 3. Environment variables
Copy [`.env.example`](.env.example) to `.env.local` and fill in your Supabase, Gemini, and optional ElevenLabs settings. Keep service-role and provider secrets server-side, without a `VITE_` prefix.

For Auth0, follow [the complete setup guide](docs/auth0-setup.md): configure `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and `VITE_AUTH0_AUDIENCE`, plus matching server `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and `AUTH0_AUDIENCE`. No Auth0 client secret is needed. Enable the Google social connection for the SPA to show it on Universal Login. Without all three public settings, existing Supabase login remains active.
**Important:** these same values also need to be added in your Vercel project's dashboard under Settings → Environment Variables — `.env.local` only powers your local dev server, not the deployed site.

### 4. Run locally
```bash
pnpm dev
```

### 5. Deploy
Push to `main` — if the repo is connected to Vercel, it deploys automatically. Otherwise, import the repo at [vercel.com](https://vercel.com) and add the environment variables from step 3.

---

## Database setup and Auth0 identity

The ordered [migration files](supabase/migrations/) are the executable source of truth; do not substitute an abbreviated schema or disable their access policies. Pushing GitHub code or redeploying Vercel does not apply SQL in Supabase.

For an existing up-to-date Campfire database, Auth0 adds only [`20260913000900_auth0_profiles.sql`](supabase/migrations/20260913000900_auth0_profiles.sql). It adds `profiles.auth0_id text unique` and protects browser writes to that mapping. No other table shape changes. Fresh databases need all earlier migrations too.

Auth0 login is verified server-side at `/api/auth0-session`. A backing Supabase Auth user provides the UUID required by the existing `profiles.id` foreign key. The server resolves the profile and exchanges a single-use login token for a normal Supabase session; existing features continue querying UUIDs and using `auth.uid()` unchanged.

Existing guest/email accounts are **not automatically merged** with Auth0 by email. First-time Auth0 login creates a separate account; previous accounts and room data stay intact. Returning to the same Auth0 identity reuses its UUID, avatar, and memberships. Sign-out clears the local Supabase session and signs out of Auth0.

Use the full local/Vercel app for Auth0: GitHub Pages cannot host its API route. See [Auth0 setup and verification](docs/auth0-setup.md) for dashboard URLs, Google connection, environment values, and deployment checks.

## Room games and flashcards

- **Spark Round:** five questions, no countdown. Everyone answering reveals the result, or use **End question and reveal answer**. Review the explanation, then select **Next question**.
- **The Ember Riddle:** progressively specific shared clues, optional cached narration, and a winning buzz-in guess.
- **Two Truths, One Lie:** discuss and vote within 40 seconds, then review the false statement and explanation.
- **Flashcards:** generate from saved syllabus topics; flip, browse, and shuffle. Whole-syllabus generation saves one topic at a time.
- **End game for everyone** closes an active game after confirmation. Game scores remain separate from the study leaderboard.

[Game setup and rules](docs/room-games-and-flashcards.md) · [Repository map](docs/repository-structure.md) · [Auth0 setup](docs/auth0-setup.md)

---

## Team

Built by a team of 4 at HackWesTX 2026.
- Hitendra Annavarapu
- Avdhesh Chhetri
- Charan Suguri
- Aaryan Lawand

---

*You don't have to figure everything out alone.*
