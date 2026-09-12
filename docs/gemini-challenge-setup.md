# Gemini challenges

The live path is: room dashboard → Start Session/Open challenges → Join session → select syllabus topic → Generate with Gemini. Each of 3–6 signed-in participants opens the same session on their own device. The existing practice puzzle button and standalone local demo remain available. There is no Claude route in this repository, and no Claude integration was added, per the updated request.

## Deployment

1. Apply `supabase/migrations/20260912000600_generated_challenges.sql` after the five existing migrations. It adds a server-only save function and prevents generated puzzles from being randomly selected by the existing practice-puzzle function. It does not rename or add columns to the shared tables.
2. Set these **server-only** environment variables on Vercel (or in uncommitted local `.env.local`):

   ```dotenv
   GEMINI_API_KEY=your-google-ai-studio-key
   GEMINI_CHALLENGE_MODEL=gemini-3.8-flash
   SUPABASE_URL=your-supabase-project-url
   SUPABASE_ANON_KEY=your-publishable-or-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-server-service-role-key
   ```

3. Keep the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the browser. Never add `VITE_` to the Gemini or service-role key. Existing `GEMINI_MODEL` settings for syllabus and teach-back are unchanged.
4. Deploy to Vercel, which discovers the root `api/` handlers. For local API testing use `vercel dev`; plain `vite` serves the frontend only. `vercel.json` gives generation 60 seconds, while the Google request times out after 45 seconds.
5. Give the room a subject tag and add/upload syllabus topics. Three to six room members must join the study session before generating a round.

The chosen default, `gemini-3.8-flash`, is listed as stable with text and structured-output support in Google's documentation checked on September 12, 2026. `GEMINI_CHALLENGE_MODEL` can override it without changing the client or the syllabus model. Model availability and quota must also be enabled for your Google project.

## API contracts

`POST /api/generate-challenge-gemini` uses `Authorization: Bearer <Supabase access token>` and `Content-Type: application/json`.

```json
{
  "roomId": "room-uuid",
  "sessionId": "active-session-uuid",
  "subject": "CS",
  "topicTitle": "Recursion"
}
```

`roomId` is required for membership authorization. `sessionId` is optional for generation-only callers; the integrated UI supplies it so ended sessions and invalid rosters are rejected before the paid request. Subject and topic are verified against that room's database records.

Success is exactly:

```json
{
  "full_answer": "42",
  "clues": [
    { "clue_text": "First partial clue and common question…", "order_index": 0 },
    { "clue_text": "Second partial clue and common question…", "order_index": 1 }
  ]
}
```

There are 2–3 distinct partial clues and a canonical answer of at most 160 characters. CS/ECE gets logic/code/circuit puzzles, Medicine gets fictional educational cases, and other subjects get constrained creative/design puzzles. Structured output is validated again on the server. Invalid JSON, truncated/blocked output, bad input, missing credentials, timeouts, and quota failures return `{ "error": "..." }` with appropriate non-2xx statuses. Provider response bodies and credentials are never returned.

The client then calls `POST /api/save-challenge` with the same room/session/subject/topic fields plus `challenge: <generated object>`. The session ID is required here. Both handlers use the existing Supabase authentication and room-membership helper. The save route takes the user identity from the verified token, not a client user ID, and calls `cf_save_generated` with the server-only service-role client.

## Database and clue privacy

The save function locks the session, checks membership, active status, topic ownership and the roster, and writes the round plus its assignments in one transaction. A competing start returns the already-active round rather than duplicating it. Public `challenges` holds round metadata; public `challenge_clues` holds assignments. The answer remains in the existing private puzzle store. The existing snapshot, answer-checking, cancellation and Realtime flows handle generated rounds without a separate game engine.

With 2–3 partial clue roles and 3–6 people, multiple teammates can share a role; each receives only one partial clue. Existing row-level policies still restrict clue reads to their assignee. Answers use the existing case/whitespace-insensitive exact match; puzzles are prompted for one concise canonical answer rather than free-form grading.

The requested generation response contains the answer and all clues, so the initiating browser can inspect them in its network tools. Other participants get only their assigned clue through the normal snapshot. This contract is suitable for a collaborative demo, not a cheating-resistant competition. The save endpoint accepts validated caller-provided puzzle content; it does not attest that the content came from Gemini. A future competitive version should generate and save entirely server-side and return only the round ID.

## UI and reuse

- `StartChallenge.tsx` is the small topic selector and **Generate with Gemini** button. Its `onGenerate({ subject, topicTitle })` callback plugs into the adapter.
- `supabaseAdapter.ts` calls generation, then saves to the same game tables. If saving fails, retrying the same topic reuses the generated content while the component remains mounted.
- `ChallengeEngine.tsx` exposes the new control before a round and after solving one, alongside the existing practice path.
- `SessionChallenges.jsx` loads the room's topics and joins the authenticated user to the session without overwriting existing phone state.
- `Session.jsx` and `RoomDashboard.jsx` connect the feature to the app's real routes.
- `server/challengeGeneration.js` contains the provider request, output validation and room/topic checks. Both API handlers are thin wrappers around these shared checks.

No existing handoff files or their named interfaces were renamed. No Gemini SDK or new runtime dependency is required; the server uses Node's `fetch`.

## Demo checklist

After deploying the migration and setting credentials, create a subject-tagged room with a syllabus topic. Start/open a session and join with three accounts. Generate with Gemini, inspect that each participant sees a partial clue, submit a wrong answer, then the canonical answer. Verify the solved state updates on every device. End/cancel and start another round. Test a denied API key or quota error: the UI must show an error instead of switching providers or pretending a practice puzzle was generated by Gemini.

Local automated tests cover mocked provider responses, authenticated-route ordering, UI selection/duplicate clicks, and the generated-round lifecycle against PostgreSQL semantics. They do not certify the quality of a live generated puzzle or access to your Google project.

References: [Google's model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [structured output REST format](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).
