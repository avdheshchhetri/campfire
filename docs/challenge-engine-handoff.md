# Campfire · Collaborative challenge engine

A drop-in React + TypeScript feature for an existing Campfire room/session. Built with Vite, Tailwind 4, and Supabase. Players receive different clues, discuss them out loud, and submit a shared answer. No AI service required.

## Run the interactive demo

```sh
npm install
npm run dev
npm test
npm run build
```

Open `/challenge-demo.html` on the development server for the standalone **local, in-memory demo**. Start a round and use the perspective selector to read three different clues. The answer is `2 A`. Refreshing resets the demo; it does not simulate multi-device networking. Demo solutions are intentionally in the browser and never used by the live adapter. The main `/` page is Section D's authenticated app shell; the challenge feature remains available for live integration through the component below.

## Integrate with the team's app

1. For a fresh database, apply the repository migrations in filename order: `20260912000100_shared_schema.sql`, `20260912000200_access_and_room_functions.sql`, `20260912000300_challenge_engine.sql`, then `20260912000400_challenge_permissions.sql`. Apply each once. The challenge migration retains the original SQL but now follows the host schema and access rules. The final migration removes host column-level UPDATE grants that survive table-level revocation. Existing duplicate active split-puzzle rounds must be resolved before the unique index can be created.
2. Use `src/features/challenges` in the host app, or copy it into another app without the demo adapter and tests when those are unnecessary. It requires React, `@supabase/supabase-js`, `lucide-react`, and Tailwind 4 through `@tailwindcss/vite`. `src/challenge-demo.css` supplies the standalone demo theme and is loaded only by `/challenge-demo.html`; merge the needed styles with the host's theme when wiring the live component instead of importing its global reset unchanged.
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

The shared schema and host access migration secure profiles, rooms, room_members, sessions, session_presence, and syllabus topics. The challenge migration then secures **challenges and challenge_clues** and their RPCs; the permissions migration removes the remaining column-level UPDATE grants. Together they deny direct client mutations of both challenge tables while restrictive SELECT policies keep each clue visible only to its assignee. Challenge writes must use the supplied RPCs. No service credentials are needed by this module.

If a database already ran the original `202609120001_challenge_engine.sql` manually or recorded its old version, inspect and verify its schema and migration history before applying this merged sequence. Reconcile the old challenge version with `20260912000300` only after confirming that its SQL is already present; do not run it twice or blindly rerun the shared schema. Apply only missing migrations in dependency order and finish with `20260912000400_challenge_permissions.sql`. Existing deployed databases need that history review; this repository's automated checks start from an empty database.

The supplied leaderboard counts all room topics identically for every member; this feature deliberately leaves it unchanged and does not present individual scores.

## Verification

`npm test` runs all host and feature suites; `npm run test:challenges` runs the nine challenge adapter and database tests. In embedded PostgreSQL (PGlite), all four migrations run in filename order, followed by the host RLS regression suite and challenge lifecycle checks. These cover private perspectives, answer normalization, failed/correct submissions, reset/cancel, subscription cleanup, RLS isolation, anonymous/outsider denial, denial of direct challenge and clue writes by room members, private answer storage, 3–6 participant distribution, late joiners, and ended sessions. Only the Supabase auth schema and JWT delivery are simulated; parent-table policies come from the real migrations. Hosted JWT delivery and realtime still require integration testing. `npm run build` checks TypeScript and builds both the host and standalone demo. The combined dependency lockfiles also support `pnpm install`, `pnpm test`, and `pnpm run build`; see the repository README for setup.

Before deploying, use a Supabase test project and 3–6 separate authenticated browser profiles:

1. Join one active room/session, start on two devices simultaneously, and verify exactly one active round and six clues.
2. Each device must see only its assignments, including a direct REST query to `challenge_clues`. An outsider's snapshots and writes must fail. Anonymous requests must fail. Verify parent-table policies prevent self-enrollment into arbitrary rooms.
3. Submit wrong then correct answers; all devices must converge to the same attempts/status. Simultaneous correct submissions must count once.
4. Confirm another room/session ID cannot access or mutate this round; a late joiner cannot submit; an ended session rejects start/submit.
5. Disconnect/reconnect, cancel/restart, remove a presence row, and verify polling recovers the roster and round state.
6. Test at 390px and desktop widths; use keyboard navigation and hidden-clue controls.

Reference: [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [Tailwind Vite setup](https://tailwindcss.com/docs/installation/using-vite).
