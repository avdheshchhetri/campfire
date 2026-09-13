# Campfire

**Study together. Put your phones down. Help each other learn.**

Campfire is a group study app with shared rooms, a syllabus learning map, Gemini-powered teach-back and challenges, and a shared focus timer that runs while everyone’s phone is face-down.

Built with **React 19, Vite 7, Tailwind CSS 4, Supabase Auth/Postgres/Realtime, and Google Gemini**. Serverless API routes run on Vercel; local development runs the same handlers through Vite.

[Website on GitHub Pages](https://avdheshchhetri.github.io/campfire/) · [Setup and troubleshooting](#troubleshooting) · [Repository map](docs/repository-structure.md)

> **Hosting matters:** GitHub Pages serves the interface and supports Supabase-backed features. It cannot run Gemini APIs. For the complete app, use local development with configured server credentials or deploy the frontend and API routes together to Vercel. Pushing code does **not** apply Supabase database migrations.

## Features

| Area | What it does |
| --- | --- |
| Accounts | Email/password registration and login, guest access, and guest-to-account upgrades |
| Avatars | Choose initials, flame, fox, owl, rocket, leaf, or star; shown across rooms, sessions, and rankings |
| Study rooms | Create a room with a subject and exam date, invite teammates using its join code, and share a syllabus |
| Learning map | Review syllabus topics, track untouched/awaiting-verification/verified states, and see approaching-exam reminders |
| Syllabus analysis | Extract suggested topics from pasted text or PDF batches using Gemini; review and edit before saving |
| Teach-back | Explain a topic, answer a generated follow-up question, and receive a verification result |
| Shared focus | Live phone states, highlighted interruptions, and a timer that pauses when a participant is up or disconnected |
| Gemini challenges | Individual questions with hints passed to other named teammates, encouraging discussion |
| Practice puzzles | Built-in collaborative puzzles with private clues and one shared group answer; no AI key required |
| Progress and leaderboard | Personal verified-topic credit plus completed group challenge wins |
| Appearance | Persistent light/dark theme, Fraunces display text, and IBM Plex Sans body/UI text |

### How individual challenges work

New **Generate with Gemini** rounds support 1–6 participants and use a syllabus topic from the room.

- **Maths:** everyone gets the same question format with different numbers. For example, one person solves `3x + 5 = 26`, while another solves `4x + 7 = 35`.
- **Other subjects:** everyone gets a different question within the same topic, at comparable difficulty. Historical-figure questions might ask about the first US president and the president who issued the Emancipation Proclamation in 1863.
- The question appears directly under the topic. Teammate hints start collapsed and require a reveal click; the owner’s name/avatar stays visible. Each person sees their own question. Its hint goes to the next teammate in the round’s fixed roster, labeled **“Hint for [name]”**, with that question’s context.
- Each person submits their own answer, and answers are required to differ across participants. The next quiz stays locked until every assigned participant answers correctly. After eight incorrect attempts, that user’s own hint is automatically shown and one point is deducted once for that question; this does not mark the answer correct.
- Answers are saved in a private database table and checked server-side. The individual-generation response returns only the round ID.
- Solo rounds show the player their own hint. Join before a round starts to receive an assignment; late joiners participate in the next round.

Existing rounds and the practice puzzle bank retain their shared-answer behavior. Start a **new Gemini round** after applying the individual-question migration. There is no Claude integration in this repository.

### How shared focus works

Each participant opens the phone view, taps **Enable Motion Detection**, and places their phone face-down. Orientation readings update their `up`/`down` state at most once every two seconds. **Simulate Face-Down** provides a manual override when sensors are unavailable or unreliable.

The shared screen shows the room roster and runs the timer while everyone’s last saved state is down. A sleeping or disconnected phone retains its last state until a new reading arrives. Accumulated time survives navigation between app views in the same browser. Ending a session sets `ended_at` and `is_active: false`.

**Device limits:** motion detection needs HTTPS on real phones and may require explicit permission. The phone page requests a screen wake lock to prevent automatic sleep while supported and permitted. Manually locking the phone, switching apps, battery-saving settings, or browser suspension can stop detection; a website cannot guarantee background motion tracking. Campfire intentionally assumes the last position is unchanged during that gap, including a lost connection. The display labels offline down states as assumed focus. A fresh up reading pauses the timer; a fresh down reading keeps it running. End the session when finished. The timer is accumulated per browser, not a server-authoritative clock synchronized across independent shared screens. Reload restores saved time but does not credit the unobserved gap.

## Run locally

### Prerequisites

- Node.js **22.12 or later**; CI uses Node.js 24.
- npm and Git.
- A Supabase project with the migrations and Auth settings below.
- A Gemini API key for AI features.

```sh
git clone https://github.com/avdheshchhetri/campfire.git
cd campfire
npm ci
cp .env.example .env.local
```

On Windows, copy `.env.example` to `.env.local` using your editor or file manager. Edit **the repository-root `.env.local`**, supply your own values, then run:

```sh
npm run dev
```

Open the address printed by Vite, normally `http://127.0.0.1:5173`. The development server includes the `/api` handlers; a separate `vercel dev` process is not required. Restart after changing environment variables.

### Environment variables

| Name | Visibility | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Public/browser | Full Supabase URL, such as `https://YOUR_PROJECT_REF.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Public/browser | That project’s publishable key or legacy `anon` key |
| `SUPABASE_URL` | Server | Same project URL, used by API handlers |
| `SUPABASE_ANON_KEY` | Server | Same public key, used when validating the caller’s session and permissions |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret/server only** | Privileged database access for verified teaching results and generated questions |
| `GEMINI_API_KEY` | **Secret/server only** | Google Gemini API access |
| `TEACHING_SIGNING_SECRET` | **Secret/server only** | Random secret of at least 32 characters for signed teach-back attempts |
| `GEMINI_MODEL` | Server configuration, optional | Syllabus analysis/teach-back model override |
| `GEMINI_CHALLENGE_MODEL` | Server configuration, optional | Challenge-generation model override |

Use model IDs available to your Gemini project. The example file contains explicit overrides; check them rather than assuming an older model remains available. Generation defaults and fallback behavior are defined in [challengeGeneration.js](server/challenges/challengeGeneration.js) and [teachback.js](server/syllabus/teachback.js).

Generate a signing secret locally, then paste the result into `.env.local`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep `.env.local` out of Git; it is ignored. **Never prefix Gemini, service-role, or signing secrets with `VITE_`.** Vite embeds public-prefixed values into the browser bundle. The Supabase URL and public key are intentionally public; Auth and row-level security enforce access. All Supabase values must belong to the same project.

## Supabase setup

### 1. Configure authentication

In the Supabase project’s Authentication settings:

1. Enable the **Email** provider for accounts and **Anonymous Sign-Ins** for guest access.
2. Configure the email-confirmation flow and email delivery for your deployment.
3. Set the Site URL to the website root and allow the required redirect URLs. Include `http://127.0.0.1:5173/` for local development. GitHub Pages uses `https://avdheshchhetri.github.io/campfire/`.
4. Verify the guest-upgrade flow: add an email, confirm it, return to Account, and set a password. It retains the guest’s identity and room data; it does not merge a separate existing account.

Guest identity persists in the current browser. Clearing its stored session or using another device does not recover that guest account. See [Accounts and avatars](docs/accounts-and-avatars.md) for the account UI and deployment checks.

### 2. Apply all database migrations in order

The SQL files in [`supabase/migrations/`](supabase/migrations/) are the database source of truth.

| Order | Migration | Purpose |
| --- | --- | --- |
| 1 | [20260912000100_shared_schema.sql](supabase/migrations/20260912000100_shared_schema.sql) | Original shared tables and leaderboard view |
| 2 | [20260912000200_access_and_room_functions.sql](supabase/migrations/20260912000200_access_and_room_functions.sql) | Room operations, access policies, and indexes |
| 3 | [20260912000300_challenge_engine.sql](supabase/migrations/20260912000300_challenge_engine.sql) | Private puzzle bank, round lifecycle, and clue access |
| 4 | [20260912000400_challenge_permissions.sql](supabase/migrations/20260912000400_challenge_permissions.sql) | Restrict direct browser challenge writes |
| 5 | [20260912000500_teaching_permissions.sql](supabase/migrations/20260912000500_teaching_permissions.sql) | Server-controlled teaching verification |
| 6 | [20260912000600_generated_challenges.sql](supabase/migrations/20260912000600_generated_challenges.sql) | Generated puzzle persistence |
| 7 | [20260913000100_profile_avatars.sql](supabase/migrations/20260913000100_profile_avatars.sql) | Shared avatar selection |
| 8 | [20260913000200_session_challenge_fixes.sql](supabase/migrations/20260913000200_session_challenge_fixes.sql) | Solo/pair rounds and member progress scoring |
| 9 | [20260913000300_cross_teammate_hints.sql](supabase/migrations/20260913000300_cross_teammate_hints.sql) | Named hints passed to teammates |
| 10 | [20260913000400_individual_questions.sql](supabase/migrations/20260913000400_individual_questions.sql) | Individual questions, private answers, and per-person completion |
| 11 | [20260913000500_quiz_assistance.sql](supabase/migrations/20260913000500_quiz_assistance.sql) | Distinct answers, eight-attempt hint assistance, point penalties, and next-quiz gating |

**SQL Editor:** on an empty project, open each file, copy its full contents into **SQL Editor → New query → Run**, and proceed in the order above. On an existing project, apply only missing migrations after verifying what was already run. Do not rerun the original schema over existing tables.

**Supabase CLI:** if migration history is managed by the CLI:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

If SQL was previously executed manually, reconcile the actual schema with migration history before using `db push`. Mark only migrations that were fully applied; migration-history repair does not create missing tables or functions. No GitHub workflow in this repository automatically applies database migrations.

### 3. Verify Realtime and access

Confirm `sessions`, `session_presence`, and `challenges` are enabled for Postgres Changes in the Supabase Realtime publication. Focus also uses Realtime Presence for connection liveness. Test with two separate accounts/devices, not just two tabs sharing the same account.

Core access rules:

- Room creation/joining uses authenticated `create_room` and `join_room` functions.
- Users can write only their own phone presence within an accessible room.
- Challenge actions use `cf_start`, `cf_snapshot`, `cf_submit`, and `cf_cancel`.
- Named hints are readable by their assigned holder; individual answers stay in `cf_private`.
- Server routes authenticate the user and validate room/session/topic access before privileged writes.
- Passwords go directly to Supabase Auth; they are not stored in application tables.

## Syllabus and progression details

- Paste up to **50,000 characters**, or upload a PDF up to **200 MB / 1,000 pages**.
- Large PDFs are split in the browser into smaller API batches. Each batch must fit within **3 MB / 50 pages**; a single oversized page is rejected. This is batching, not guaranteed compression to a target file size.
- Scanned pages must be readable; password-protected PDFs are unsupported. Large books use multiple Gemini requests and take longer.
- Review extracted topics before saving them. The app stores the topics you choose, rather than storing the original uploaded PDF in a file bucket.
- Teach-back requires an explanation and a follow-up answer. An explanation alone does not verify a topic. Drafts are retained temporarily in the current browser tab.
- Personal teaching credit follows verified topics attributed through `last_taught_by`. Completed group rounds contribute challenge wins to their original participants. Ranking combines these counts minus hint penalties; percentage progress measures verified topics.
- Without the member-progress migration, the UI may fall back to the original shared-room leaderboard values. Correct personal scoring requires all migrations.

## Deployment

### Full app: Vercel

Import this repository and use the checked-in [`vercel.json`](vercel.json):

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Root | Repository root |
| Install | `npm ci` |
| Build | `npm run build` |
| Output | `dist` |
| Node.js | 24.x, matching CI |

Add the environment variables above to the intended deployment environments. Public Supabase variables can be readable configuration; Gemini, service-role, and signing values must be secrets. Do not set `VITE_GITHUB_PAGES=true` for Vercel.

Redeploy after changing environment values, update Supabase Auth redirect URLs, and apply pending SQL migrations separately. The API routes must be hosted with the frontend at `/api/*`. Verify a room deep link and a real AI request after deployment.

The repository does not establish your hosting plan or spending limits. Check the connected Vercel account/project before deploying; do not assume that a successful build establishes billing settings.

### Static interface: GitHub Pages

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds and publishes on pushes to `main`. In repository Settings → Pages, select **GitHub Actions** as the source.

Pages builds use `/campfire/`, hash-based routing, and the public Supabase configuration in [`config/public-supabase.json`](config/public-supabase.json). Change that public configuration when using a different Supabase project; changing local `.env.local` does not change this Pages build configuration.

Auth, rooms, focus, leaderboard, and practice puzzles can use Supabase from Pages. **Gemini generation, PDF/text analysis, and teach-back require an API host and are not enabled by adding secrets to a static Pages deployment.** See [GitHub Pages details](docs/github-pages.md).

## Repository structure

```text
api/                     Serverless API entry points
server/
  challenges/            Gemini generation, question validation, route tests
  syllabus/              PDF analysis, teach-back, signing, and helpers
  security/              Database permission tests
  dev/                   Local Vite API bridge
src/
  pages/                 Route-level screens
  components/            Shared layout and theme controls
  features/
    auth/                Accounts, guest sessions, and avatars
    rooms/               Room operations
    focus/               Orientation, presence, wake lock, and timer
    syllabus/            Upload, learning map, and teach-back UI
    challenges/          Questions, clues, round UI, and adapters
    leaderboard/         Rankings and progress display
  lib/                   Shared Supabase client
  styles/                Global styles and theme colors
supabase/
  migrations/            Ordered database migrations
  tests/                 SQL access-control checks
demo/                    Isolated challenge and syllabus demos
config/                  Public build configuration
docs/                    Feature handoffs and setup notes
.github/workflows/       Verification and Pages deployment
```

Use the shared client in `src/lib/supabaseClient.js`; `src/supabaseClient.js` is a compatibility export of the same instance. Feature tests live alongside their code. Route composition is in `src/App.jsx`.

| Route | Screen |
| --- | --- |
| `/` | Landing, sign-in, room creation/joining |
| `/account` | Account and avatar settings |
| `/room/:roomId` | Room overview |
| `/room/:roomId/syllabus` | Learning map, upload, and teach-back |
| `/room/:roomId/session/:sessionId` | Session and challenges |
| `/room/:roomId/session/:sessionId/phone` | Phone presence |
| `/room/:roomId/session/:sessionId/shared` | Shared focus display |
| `/room/:roomId/leaderboard` | Room rankings |

## Commands and verification

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local app and API handlers |
| `npm test` | React, helper, server, adapter, and database tests |
| `npm run typecheck` | TypeScript checks |
| `npm run build` | Type-check and create the production bundle |
| `npm run preview` | Preview built assets; not a substitute for deployed API functions |
| `npm run dev:syllabus` | Isolated simulated syllabus demo |
| `npm run build:syllabus-demo` | Build that demo separately |

`/challenge-demo.html` uses simulated participants and local state. It does not prove live authentication, database, or Gemini integration.

Before merging, run `npm test` and `npm run build`. Database tests apply migrations in PGlite with simulated Supabase auth roles; they cover permissions, private clues/answers, assignment, and round completion. Hosted Auth/email delivery, real Realtime connections, and iOS/Android sensors still require live checks.

Suggested end-to-end check: sign in with two accounts, join the same room/session, generate questions, confirm hints are exchanged, submit both answers, inspect progress, then test face-down/up behavior and navigation on the shared timer.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| “Invalid API key” on sign-in | Use the full project URL and its matching public Supabase key; restart locally or rebuild the deployment |
| Room creation or joining fails | Sign in, confirm the profile exists, and apply the shared/access migrations |
| Gemini button is disabled | Select a saved syllabus topic, join the session, and keep its roster within 1–6 participants |
| AI needs a server / API unavailable | Use configured local development or full API hosting; Pages alone cannot run Gemini |
| Gemini quota, unavailable-model, or temporary errors | Check server credentials, supported model IDs, and API quota; retry transient failures |
| Individual questions cannot save | Apply migrations 10–11 and their predecessors, then start a new round |
| Everyone has equal or stale leaderboard values | Apply migration 8; verify that topics/rounds have actually completed |
| Avatars do not appear for peers | Apply migration 7 and verify profile read access |
| No phone readings / focus pauses on lock | Use HTTPS, grant motion permission, keep the phone page visible, and check keep-awake status; simulation is available |
| Confirmation email returns to the wrong website | Correct Supabase Site URL/allowed redirects and deployment configuration |
| PDF is rejected | Check overall size/page limits, oversized individual pages, encryption, and scan readability |

## Working on Campfire

Keep changes in the matching feature folder, coordinate shared routes/auth/client changes with the team integrator, and add ordered migrations for database changes. Never commit credentials or overwrite another teammate’s work. Include relevant tests and deployment/setup notes with a feature change.

Useful references: [repository map](docs/repository-structure.md), [accounts](docs/accounts-and-avatars.md), [session and challenge updates](docs/session-fixes.md), [focus handoff](docs/section-b-handoff.md), and [syllabus handoff](docs/syllabus-teachback-handoff.md). Older handoffs may describe earlier behavior; the current code and ordered migrations take precedence.
