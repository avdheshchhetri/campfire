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

## Cross-teammate hints

Apply `supabase/migrations/20260913000300_cross_teammate_hints.sql` after the earlier migrations. New Gemini and practice rounds pass each named hint to the next teammate in the fixed round roster. Everyone works on one shared question and answer; hints say “Hint for [name]” and remain private to their holder until shared aloud. Solo rounds retain every clue. Existing rounds stay unchanged, so start a new round after applying this migration. Gemini is instructed to repeat the identical question and answer format in each clue. Names are added from profiles on the server, not invented by Gemini.

## Individual Gemini questions (supersedes the shared-question Gemini flow above)

Apply `supabase/migrations/20260913000400_individual_questions.sql` after the preceding migrations and start a new Gemini round. For maths, Gemini supplies one template and six distinct sets of numeric values; the server renders each question from that same template. For other subjects it generates six distinct questions within the same syllabus topic, each with its own answer and relevant hint. History questions must specify country, event or period as needed for a clear answer. Each participant receives their own question; its named hint and question context go to the next participant. Answers remain server-side in `cf_private.individual_questions`, and each submission checks only the caller’s answer. The round completes and awards its existing group win when every assigned participant has solved their version. Solo rounds have one question and its hint. Older rounds and the practice bank retain their shared-answer behavior. The generation API’s `mode: individual` creates the round server-side and returns only its ID; the legacy contract remains available for older integrations. A failed save may require generating again.

## Phone keep-awake

Active phone focus pages request Screen Wake Lock, release it when leaving/ending, and reacquire it when visible again. The page reports failures and offers retry. HTTPS and browser support are required; battery saver may deny the request. This prevents automatic screen sleep when granted, but cannot run orientation sensors through a manual phone lock or browser suspension. The shared screen continues to pause on lost presence or an up state rather than count unobserved focus. Real iOS/Android hardware behavior still needs a device check; automated tests cover lock lifecycle, rejection/retry and cleanup.

Validation for these follow-ups: 124 automated tests passed, TypeScript passed, and the production build passed. A live Gemini maths request returned six distinct linear equations; their supplied integer answers were checked. Supabase migrations still need to be applied to the deployed database.
