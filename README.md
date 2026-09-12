# Campfire — Section D

A group study app built with React, Vite, Tailwind CSS, React Router, and Supabase. **Section D** is the app shell, navigation, authentication, room flow, leaderboard, and integration scaffold. It includes anonymous sign-in, first-login profiles, room creation/joining/leaving, shared navigation, session status, and a leaderboard. The room dashboard and active-session routes contain integration placeholders.

The application is named **Campfire**; the repository and planned Vercel project are named **campfire**. Existing Section B code in `src/campfire/` and `docs/section-b-handoff.md` has been preserved. That module needs the integration work described below before it can replace the session placeholder.

## Run locally

Use Node.js 24 and npm. From the repository root:

```sh
npm ci
```

Copy `.env.example` to `.env.local`, then replace its two placeholders:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

```sh
npm run dev
```

Open the address printed by Vite, normally `http://127.0.0.1:5173`. Restart the development server after editing environment values. Without configuration, the app renders a setup message; authentication and database actions require a configured Supabase project.

Other commands:

```sh
npm test
npm run build
npm run preview
```

The production build is written to `dist/`. `npm test` runs the React/Vitest checks and Node helper tests, including the preserved Campfire module's helper tests.

### Environment values and sharing

| Value | Where it belongs | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Local `.env.local`; Vercel Preview and Production | Supabase project API URL |
| `VITE_SUPABASE_ANON_KEY` | Local `.env.local`; Vercel Preview and Production | Public publishable key or legacy `anon` key; keep this variable name for the shared client |
| `ANTHROPIC_API_KEY` | Server environment or Supabase Edge Function secrets only | Future syllabus/challenge AI calls; this scaffold does not call Claude |

The two Supabase browser values are intentionally public in the built app. Database access is protected by Auth and row-level security, not by hiding a public API key. Never place a service-role/secret key or Claude API key in any `VITE_` variable: Vite includes those variables in client code. See [Vite environment variables](https://vite.dev/guide/env-and-mode).

Keep `.env.local` out of Git; `.gitignore` already excludes real environment files. Share the repository link and Supabase setup values through the team's private channel. Share an AI secret only with the teammate managing the server/Edge Function; do not add it to frontend configuration or a client-side request.

## Set up Supabase

The intended hosted organization is **hearth-hackathon**, with region **US East (N. Virginia)**. A hosted Supabase project has not yet been provisioned for this scaffold. Create/select that project, then copy its API URL and public key into the two environment variables above.

Enable **Anonymous Sign-Ins** in the project's Auth settings. Anonymous users receive the `authenticated` database role after sign-in. The app creates their `profiles` row with an idempotent insert and preserves an existing display name. Guest sessions persist in that browser; clearing browser storage or switching devices does not recover the same guest identity. See [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous).

### Apply the migrations once, in order

1. `supabase/migrations/20260912000100_shared_schema.sql` is the exact schema supplied for the team: eight tables and the original leaderboard view.
2. `supabase/migrations/20260912000200_access_and_room_functions.sql` adds access policies, safe room functions, indexes, and `security_invoker` on that same view. It does not change the shared columns or leaderboard calculation.

For a fresh hosted database, use the Supabase CLI from the repository root:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

If the original schema was **already run manually**, first verify that every table and the view match the first migration exactly. Then mark that migration as applied and run only pending migrations:

```sh
npx supabase migration repair 20260912000100 --status applied
npx supabase db push
```

`migration repair` updates migration history; it does not create or verify schema objects. Do not mark a partial or different schema as applied. Do not rerun the first migration over existing tables. The [Supabase migration guide](https://supabase.com/docs/guides/deployment/database-migrations) explains this workflow.

Alternatively, use the project's SQL Editor: run the first file once on an empty database, then run the second file once. If the original schema already exists exactly, run only the second. If you later switch to CLI migrations, verify the database and mark each successfully executed migration as applied before using `db push`.

For optional local Supabase development, install Docker and run `npx supabase start`. `supabase/config.toml` enables anonymous sign-ins locally. Use the local URL/public key reported by the CLI in `.env.local`; the hosted Auth setting must be enabled separately.

### Database behavior

| Operation | Contract |
| --- | --- |
| Create room | `create_room(p_name, p_subject = null, p_exam_date = null)` returns a room UUID; room and creator membership are created atomically |
| Join room | `join_room(p_join_code)` returns a room UUID; codes are trimmed and case-insensitive; repeated joins are idempotent |
| Room code | Ten random uppercase hexadecimal characters |
| Leave room | Delete your own `room_members` row; room contents remain |

Both RPCs require a signed-in user with a profile. Direct browser insertion into `rooms` or `room_members` is blocked, so clients cannot join a room by guessing its UUID.

RLS protects all eight tables. Members can read their rooms and shared feature data; profiles are visible to their owner and room peers. Only the creator can edit room settings. Presence writes are limited to the requesting user within an accessible room. Feature writes validate referenced sessions/topics and assigned users against the room. The leaderboard respects those same access rules.

Browser updates are granted only for mutable fields. Do not send identity/parent fields such as `id`, `room_id`, `session_id` in a presence update, or `challenge_id` in a clue update. Use explicit inserts and updates of allowed fields; an upsert that tries to update protected key columns will fail. The auth provider's `profiles` upsert deliberately uses `ignoreDuplicates: true`, which does not update existing rows.

All room members can read clue rows; `revealed` is currently a UI/data flag, not a secret-delivery boundary. The original foreign keys have no delete cascades. Session-ending permissions, active-session-only presence writes, hidden clue delivery, and any new scoring rules require an agreed integration change when those features are wired in.

## Deploy to Vercel

Create/import the **campfire** project under the intended personal Vercel account using [avdheshchhetri/campfire](https://github.com/avdheshchhetri/campfire). Use these settings:

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Root directory | Repository root |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js | 24.x |
| Production branch | `main` |

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to both **Preview** and **Production**, then deploy. Environment values are embedded at build time, so redeploy after changing them. `vercel.json` supplies the SPA rewrite for room/session/leaderboard deep links. See [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).

Once the Git integration is connected, feature branches receive preview deployments and merges to `main` trigger production deployments. Confirm the deployment succeeds and directly open a room deep link before treating a checkpoint as live. This repository includes deployment configuration; a build alone does not provision Supabase or establish a live Vercel deployment.

## Integration Notes

### Shared imports and route contracts

`src/lib/supabaseClient.js` creates the single shared Supabase client. Import it from every feature instead of creating another client. `src/supabaseClient.js` is a compatibility re-export for the existing Campfire module; both paths resolve to the same instance.

```jsx
import { useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../auth/AuthContext.jsx';

// Inside a feature rendered under the room routes:
const { user, profile, loading, error } = useAuth();
const { roomId, sessionId } = useParams();
const { room, activeSession, refreshRoom } = useOutletContext();
```

The import paths above assume a component directly inside `src/features/<feature>/`. `useAuth()` also exposes `session`, `signIn`, `retryProfile`, and `clearError`. The room guard waits for a valid profile and accessible room before rendering feature routes. Outlet context additionally includes `roomLoading` and `roomError`. Call `refreshRoom()` after creating or ending a study session; navigation also refreshes session status every 30 seconds while the page is visible.

| Route | Current component | Integration purpose |
| --- | --- | --- |
| `/` | `Landing` | Sign in, create/join a room, open existing rooms |
| `/room/:roomId` | `RoomDashboard` | Syllabus and room overview placeholder |
| `/room/:roomId/session/:sessionId` | `Session` | Campfire and challenge integration placeholder |
| `/room/:roomId/leaderboard` | `Leaderboard` | Shared progress leaderboard |

All routes render inside `AppLayout`, which owns room navigation, leave-room behavior, and session status. `src/App.jsx` is the shared route-wiring point. Replace the dashboard/session placeholders with agreed feature components there, or coordinate the small composition component needed to host multiple features.

### Folder and branch ownership

| Teammate feature | Drop components here | Branch |
| --- | --- | --- |
| Syllabus | `src/features/syllabus/` | `feature/syllabus` |
| Campfire | `src/features/campfire/` | `feature/campfire` |
| Challenges | `src/features/challenges/` | `feature/challenges` |

Those folders contain only `.gitkeep` markers so Git preserves them. Teammates own their feature folders. The shell owner coordinates shared client/auth/layout changes and migrations. **Ping the integrator before pushing an `App.jsx` import or route edit** so those shared changes can be merged cleanly.

At each agreed checkpoint, the integrator reviews the branch, resolves shared wiring, runs `npm test` and `npm run build`, and checks the feature with the configured database. Merge only validated work to `main`, then confirm its Vercel deployment. Branch merges and deployment monitoring are a team workflow, not an autonomous service included in this scaffold.

### Preserved Campfire module: integration still required

The existing `src/campfire/` files and `docs/section-b-handoff.md` are retained unchanged. That handoff records an earlier assumed contract; the shared SQL migrations are now the source of truth. Before wiring the module into a route:

1. Change its database `state` reads/writes to the schema's `phone_state`; map values back to any internal `state` objects as needed.
2. Build the full participant roster from room membership and profiles. Map `display_name` to the module's `name` field. The shared schema has no `avatar_url`; pass `null` or supply a separately agreed UI value.
3. Adapt presence persistence to the mutable-field grants instead of upserting protected identity fields. Agree any additional rules for ended sessions and host-only controls; the current policies allow room members to manage sessions and users to write their own presence.
4. Enable the required Supabase Realtime publication/channel access for `sessions` and `session_presence`, then test reconnects, leaving, and permission failures. The app shell itself uses polling and does not require Realtime publication.
5. Wire phone/shared-screen navigation into the agreed room/session routes, and test on real phones over HTTPS. Existing standalone helper tests do not establish live device or database compatibility.

The session placeholder remains until that pass is complete. Keep future Campfire work in its assigned feature folder and coordinate any move from the preserved location.

### Leaderboard meaning

The supplied view counts verified and total topics **for the room**, then repeats those counts for each member. It does not attribute verified topics to `last_taught_by`. The UI therefore shows equal ranks for members with equal shared counts, and supports sorting by progress or name without inventing individual scores.

Because the original view uses an inner join to topics, rooms with no topics return no leaderboard rows. The component falls back to the room's member list with zero progress. Per-person teaching credit needs a separately agreed migration; this scaffold preserves the team's original calculation exactly.

## Verification

Run `npm test` and `npm run build` before merging. For database regression checks, use a disposable/local database with both migrations applied:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
```

In PowerShell, use `$env:DATABASE_URL` in place of `"$DATABASE_URL"`.

`DATABASE_URL` here is a local/test PostgreSQL connection string for `psql`, not a Vite environment value. The suite uses plain SQL assertions and rolls back its fixtures; it is not a pgTAP suite for `supabase test db`.

Both migrations and this suite were executed successfully in PGlite, using mocked Supabase auth roles/functions. Checks covered profile idempotence, create/join/leave, all eight RLS-enabled tables, room isolation, cross-room references, presence impersonation, owner-only edits, anonymous access denial, unchanged leaderboard SQL, and fixture rollback. This validates PostgreSQL behavior in the test harness; hosted Supabase Auth/API, Vercel deployment, Realtime, and physical phones still need live integration checks.

## A practical 24-hour priority

Finish the shared shell/auth/room flow first, then make the syllabus usable end to end. Integrate Campfire after its schema and device checks, and add challenges last. Keep a working study flow on `main` at each checkpoint; leave unfinished features behind their placeholders.
