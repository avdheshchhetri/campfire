# Campfire · Collaborative challenge engine

A drop-in React + TypeScript feature for an existing Campfire room/session. Built with Vite, Tailwind 4, and Supabase. Players receive different clues, discuss them out loud, and submit a shared answer. No AI service required.

## Run the interactive demo

```sh
npm install
npm run dev
npm test
npm run build
```

The standalone page is explicitly a **local, in-memory demo**. Start a round and use the perspective selector to read three different clues. The answer is `2 A`. Refreshing resets the demo; it does not simulate multi-device networking. Demo solutions are intentionally in the browser and never used by the live adapter.

## Integrate with the team's app

1. Apply your existing shared Campfire schema, then run `supabase/migrations/202609120001_challenge_engine.sql` in Supabase SQL Editor or your migration workflow. Apply once. Existing duplicate active split-puzzle rounds must be resolved before the unique index can be created.
2. Copy `src/features/challenges` into your app. Exclude the demo adapter and test if you do not need them. Install React, `@supabase/supabase-js`, and `lucide-react`. Import `src/styles.css` once; Tailwind 4 requires `@tailwindcss/vite` in your Vite plugins. The CSS has global base styles—merge those with your app's existing reset/theme rather than importing duplicates.
3. Pass the team's existing authenticated Supabase client and room/session context:

```tsx
import { ChallengeEngine } from './features/challenges';

<ChallengeEngine
  client={supabase}
  roomId={room.id}
  sessionId={session.id}
  userId={user.id}
  roomName={room.name}
/>
```

The host app owns login, profiles, room membership, session creation, and presence. The supplied `userId` is for rendering only; all server authorization uses the authenticated JWT. Never put a service-role key in the browser. `.env.example` documents typical client settings; the demo does not consume them because live integration uses the host's existing client.

## Behavior and database contract

- A room member present in the active session starts a round. Exactly 3–6 presence rows belonging to room members are required. Six clues are distributed round-robin; every participant gets at least one. Phone state does not gate this feature.
- Presence rows represent joined session participants, not network liveness. The host must remove departed members before starting. Assignments are frozen during a round. If someone leaves with a needed clue, an assigned teammate can end and restart after the host updates the roster.
- Late joiners can observe the public puzzle but receive no clues until the next round. Any assigned teammate can submit or end the round. The roster view is not an online indicator.
- `cf_snapshot(room, session)` returns public challenge metadata, participant display names, and **only the caller's clues**. Answers and full templates live in a non-exposed private schema. Direct clue selects also use RLS, including a restrictive ownership boundary.
- `cf_start`, `cf_submit`, and `cf_cancel` validate membership and lock the session to serialize competing actions. A partial unique index prevents duplicate active rounds. Correct submissions set `solved` once; wrong ones increment attempts. Ended sessions reject starts and submissions.
- Realtime observes public challenge metadata only. Five-second snapshot polling handles missed events, presence updates, and reconnects. No private clue broadcasts.
- Three authored puzzles ship: series circuits, arithmetic mean, and logic. The server avoids the immediately preceding puzzle. These are generic starter exercises, not syllabus-personalized content; `topic_id` is left null. Add curated six-clue templates and accepted normalized answers to `cf_private.puzzles`.
- Only challenge tables are changed. No automatic topic verification, leaderboard scoring, room creation, phone sensing, or AI generation is included.

## Shared-schema security integration

The supplied base schema has no RLS policies. This migration secures **challenges and challenge_clues** and their RPCs, and revokes direct client writes to both tables. Coordinate that write restriction if other modules currently write these tables directly. The host team must secure its profiles, rooms, room_members, sessions, and session_presence tables; otherwise a user able to forge room membership can defeat any room-level authorization. The SQL assumes trusted, correctly secured parent data. Do not deploy the base schema publicly without those host policies. No service credentials are needed by this module.

The supplied leaderboard counts all room topics identically for every member; this feature deliberately leaves it unchanged and does not present individual scores.

## Verification

`npm test` runs eight tests covering the local adapter and the real migration in embedded PostgreSQL (PGlite): private perspectives, answer normalization, failed/correct submissions, reset/cancel, subscription cleanup, RLS isolation, anonymous/outsider denial, private answer storage, 3–6 participant distribution, late joiners, and ended sessions. The fixture mocks Supabase auth and trusted parent data; hosted JWT delivery, realtime, and the host's parent-table policies still require integration testing. `npm run build` performs strict TypeScript checking and production bundling. A pnpm lockfile is included for reproducible installs (`pnpm install`, `pnpm test`, `pnpm run build`).

Before deploying, use a Supabase test project and 3–6 separate authenticated browser profiles:

1. Join one active room/session, start on two devices simultaneously, and verify exactly one active round and six clues.
2. Each device must see only its assignments, including a direct REST query to `challenge_clues`. An outsider's snapshots and writes must fail. Anonymous requests must fail. Verify parent-table policies prevent self-enrollment into arbitrary rooms.
3. Submit wrong then correct answers; all devices must converge to the same attempts/status. Simultaneous correct submissions must count once.
4. Confirm another room/session ID cannot access or mutate this round; a late joiner cannot submit; an ended session rejects start/submit.
5. Disconnect/reconnect, cancel/restart, remove a presence row, and verify polling recovers the roster and round state.
6. Test at 390px and desktop widths; use keyboard navigation and hidden-clue controls.

Reference: [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [Tailwind Vite setup](https://tailwindcss.com/docs/installation/using-vite).
