# Session, quiz, and progress fixes

## Fixed in the app

- Gemini quiz requests now use the working `responseMimeType` / `responseJsonSchema` format. Verified with a real server-key request returning three clues and a canonical answer.
- Solo and pair rounds are enabled (1–6 participants). An empty optional subject tag no longer disables generation. A syllabus topic and session membership are still required.
- All necessary generated clues are distributed even when there are fewer participants than clues. Larger groups retain shared clue roles.
- Challenge errors remain visible instead of disappearing on the next background poll. Answer submission is locked against double clicks; the UI explains when an answer field needs a started round.
- Focus clocks are owned by the application provider instead of the shared-screen route. They continue monitoring phones across in-app navigation, pause for disconnections/up states, and checkpoint accumulated time in browser sessionStorage. Reload restores the total without crediting unobserved time while the page was closed. Different browsers do not share a server-authoritative accumulated timer.
- Leaderboard refreshes every five seconds and when the tab becomes visible. The new progress RPC separates each member's verified topics and puzzle wins from the room's shared verification total.
- The learning map explicitly shows topics awaiting follow-up. A solved puzzle earns a puzzle win; it does not bypass teach-back verification.
- Password fields open only on request and close after a successful save.
- Learning-map topic cards and exam notices have explicit readable dark status colors.

## Required database deployment

Run `supabase/migrations/20260913000200_session_challenge_fixes.sql` in the Supabase SQL editor for the same project as the app. This updates the existing start/save functions and installs the member-only progress RPC. It preserves existing rounds, answers, membership, and topics.

Without applying this migration, the old database still enforces three participants and only provides the old shared leaderboard totals. A GitHub push does not execute Supabase SQL.

GitHub Pages still cannot run Gemini server routes. Use the configured local app or a server deployment with the server environment variables. The frontend-only Pages deployment is not a substitute for the API server.

Teach-back now falls back from an unavailable configured model to the quiz model, requests a structured question/verdict, and retries one transient text-service failure within a bounded deadline. Provider failures remain visible and never award unverified progress.

Teach-back drafts and signed follow-up attempts now survive in-app navigation within the same user/browser tab. Server-side expiry and verification checks remain authoritative.

Validation: 117 automated tests, TypeScript, GitHub Pages build, live Gemini quiz generation, live structured teach-back question, and browser inspection of the dark exam banner. The production database migration has not been applied by this code push.
