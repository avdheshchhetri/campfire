# Repository map

## Application

- `src/main.jsx`: main website entry and email-confirmation bootstrap.
- `src/App.jsx`: route definitions.
- `src/pages/`: route-level screens: Account, Landing, RoomDashboard, Session, Syllabus, NotFound.
- `src/components/layout/`: shared application shell/navigation.
- `src/components/theme/`: theme toggle and its tests.
- `src/styles/`: shared app styles, theme palette, and challenge demo stylesheet.
- `src/lib/supabaseClient.js`: the one configured browser Supabase client.
- `src/supabaseClient.js`: compatibility export retained for teammate modules and test aliases.

## Feature ownership

- `src/features/auth/`: guest authentication, email/password account API/forms, avatar rendering and tests.
- `src/features/rooms/`: room creation/join/leave data operations.
- `src/features/focus/`: phone orientation, presence writes, shared-screen timer, and focused tests.
- `src/features/syllabus/`: upload, PDF processing, learning map, teach-back, and related tests.
- `src/features/challenges/`: puzzle UI, adapters/contracts, demo data, and database integration tests.
- `src/features/leaderboard/`: ranking UI, calculations, and tests.

## Server and deployment

- `api/`: deployment-required serverless route entry points. Public route URLs are unchanged.
- `server/challenges/`: Gemini puzzle generation and challenge route tests.
- `server/syllabus/`: teach-back/PDF helpers and related tests.
- `server/security/`: database permission acceptance tests.
- `server/dev/`: local API bridge used by Vite.
- `supabase/migrations/`: ordered, additive database setup; `supabase/tests/`: SQL permission tests.
- `demo/challenges/` and `demo/syllabus/`: explicitly separate demo application entries.
- `config/`: public build configuration; `docs/`: setup/handoffs; `.github/workflows/`: CI/deployment.

Tests stay beside the feature or server area they cover. Imports, Vite entry points, test commands, CSS config paths, and documentation links were updated together with the moves. Filenames such as PhonePresencePage and SharedScreen remain recognizable. No remote feature branch was merged as part of this work.

Validation: 113 tests passed (35 React/auth, 70 feature/server/database, 8 Node), plus TypeScript and the GitHub Pages production build. The local account page was inspected in-browser. Production email delivery and Supabase dashboard settings remain deployment setup steps.
