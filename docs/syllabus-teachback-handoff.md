# Person A · Syllabus upload and AI teach-back tracker

This is a complete React/Tailwind feature module plus two Vercel Node functions. It uses the shared tables exactly as supplied: **no shared table/column changes are included**; the fifth migration restricts teaching permissions. The existing challenge and phone-presence features remain separate.

## Files and mounting

Import the named `supabase` client that your host app already exports from `src/supabaseClient.js`. This file is intentionally not recreated. The merged host app already signs users in and creates their `profiles` rows. The protected `/room/:roomId/syllabus` route mounts the upload, dashboard, and teaching views.

```jsx
import { SyllabusTracker } from './features/syllabus';

// Optional initialRoomId opens a known room; omit it for Create/Join.
<SyllabusTracker initialRoomId={roomId} />
```

Individual components are also exported:

```jsx
<CreateRoom onCreated={room => navigateToRoom(room.id)} />
<JoinRoom onJoined={room => navigateToRoom(room.id)} />
<SyllabusUpload roomId={room.id} onSaved={refreshDashboard} />
<TeachTopic roomId={room.id} initialTopicId={topic.id} onUpdated={refreshDashboard} />
<Dashboard roomId={room.id} onTeach={openTopic} onAddSyllabus={openUpload} />
```

Copy `src/features/syllabus/`, `api/parse-syllabus.js`, `api/verify-teaching.js`, `server/syllabus/teachback.js`, and `server/syllabus/pdf.js` into the host repository. Server helpers sit outside `api/` so they are not deployed as separate endpoints. Keep `@supabase/supabase-js`, `pdf-lib`, React, and Tailwind available. Merge `vercel.json` with the host's configuration. The syllabus screen accepts text and PDF documents, but no new browser client, authentication UI, persistent textbook library, or topic-question generation for group challenges is included.

## Local preview and verification

```sh
pnpm install --frozen-lockfile
pnpm run dev:syllabus
# Open http://127.0.0.1:5174/syllabus-demo.html
pnpm test
pnpm run build
pnpm run build:syllabus-demo
node --test src/features/focus/section-b.test.mjs
```

The separate syllabus preview is clearly labeled and uses in-memory Supabase/AI doubles from `demo/syllabus/`. It makes no AI requests and requires no credentials. Its assessment accepts the word `example` to exercise the success state; it does not judge knowledge. Its parser splits pasted text into lines. Selecting a PDF exercises file reading, then displays a clear live-setup requirement instead of pretending to analyze the file. Switching rooms lets you try the Create/Join forms; the seeded room code is `FIRE42`. Reload resets the demo. The demo alias exists only in `vite.syllabus-demo.config.ts` and Vitest, not the production configuration.

The repository's default entry is now the merged Campfire app. Open a room and choose Open syllabus, using `vercel dev` or a Vercel deployment for real API execution. Plain `vite` serves the UI but does not execute Vercel functions. Do not deploy the syllabus demo configuration as the real application.

## Server configuration

Set these in Vercel or an untracked local environment file, never in a `VITE_` variable:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Google AI Studio key; sent server-side in the `x-goog-api-key` header |
| `GEMINI_MODEL` | Optional model override; defaults to `gemini-2.5-flash` |
| `SUPABASE_URL` | The shared Supabase project |
| `SUPABASE_ANON_KEY` | Request-scoped caller client; used with the caller's bearer JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only teaching-status writes, after user and room/topic checks |
| `TEACHING_SIGNING_SECRET` | Random secret of at least 32 characters for signed follow-up attempts |

Both functions allow POST JSON only, authenticate through Supabase `getUser`, and check membership before calling Gemini. Inputs and model output are bounded and validated. API errors do not echo provider payloads or keys. Functions use a 45-second AI timeout and a 60-second Vercel duration; confirm those durations are available on your deployment plan. Configure deployment-level rate/spend limits before broader public use; process-local rate limiting would not be reliable across serverless instances.

## API contracts

All calls require `Authorization: Bearer <Supabase access token>` and `Content-Type: application/json`.

**POST `/api/parse-syllabus`**

```json
{ "roomId": "uuid", "text": "Unit 1: Arrays and linked lists..." }
```

Returns `{ "topics": [{ "title": "Arrays", "order_index": 0 }] }`. Gemini is explicitly prompted for only the requested JSON array; the route validates and wraps it for the client. Up to 50,000 characters and 100 topics are supported. No-topic input returns 422. The UI lets users edit/remove suggestions, then inserts new topics with Supabase JS, appending to the existing ordering and preserving all existing progress. Case/whitespace-equivalent titles are skipped. The shared schema has no title uniqueness constraint, so simultaneous imports by two users can still create duplicates; coordinate one uploader per room.

Alternatively send `{ "roomId": "uuid", "pdf": { "name": "syllabus.pdf", "data": "base64 bytes" } }`, without `text`. The browser reads the file only after Analyze PDF is selected. The server authenticates membership, validates base64/signature, rejects encrypted or invalid PDFs, and checks 1–50 pages and a 3 MB maximum. This keeps the base64 request below Vercel's 4.5 MB body limit. Gemini receives a native PDF document content block and can analyze text, readable scans, tables, and page visuals. Nothing is silently truncated. Larger files must be split before upload. Raw PDF files are not persisted by Campfire; only reviewed topics are saved. Google processes the document under the API account's data terms. Provider limitations/timeouts can still reject a valid PDF, in which case the UI offers a smaller document or pasted text.

This PDF flow extracts study topics; subsequent teach-back receives the saved topic title and the user's explanation, not the original textbook. Grounding every future question in textbook passages would require separate document storage/retrieval and is not implemented here.

**POST `/api/verify-teaching`, stage 1**

```json
{ "roomId": "uuid", "topicId": "uuid", "stage": "question", "explanation": "My explanation..." }
```

Returns `{ "question": "One follow-up?", "attempt": "signed-token", "status": "taught" }` after saving `status`, `last_taught_by`, and `last_taught_at`. The topic title is loaded from the database, never trusted from the caller. The explanation limit is 10,000 characters.

**POST `/api/verify-teaching`, stage 2**

```json
{ "roomId": "uuid", "topicId": "uuid", "stage": "evaluate", "attempt": "signed-token", "answer": "My follow-up answer..." }
```

Returns `{ "verified": true, "feedback": "Brief assessment", "status": "verified" }`, or `verified: false` and `status: "taught"`. The signed token binds the original explanation, generated question, topic, user, room, and saved teaching timestamp for 30 minutes. It is signed, not encrypted, and contains only that user's study text. The server ignores any caller-supplied question/title during evaluation. It assesses both the explanation and follow-up. Wrong answers remain taught and can be revised through a new attempt. Tokens live in component state; reloading requires starting again.

Updates compare the original status/timestamp to avoid overwriting another teacher's progress, and membership is checked again after the AI call. Successful or failed evaluation rotates the timestamp to consume the attempt. Already verified topics reject new teaching and never downgrade. An expired or superseded attempt returns 410/409 and the UI offers a fresh explanation. No teaching-session tables or new columns are used.

## Shared-app database integration

Apply the repository's five migrations in order. The original columns are preserved. The fifth migration removes authenticated UPDATE/DELETE privileges on existing topics and uses a restrictive INSERT policy requiring untouched status with null teaching attribution. The server-only service role can update status after API authorization; clients cannot award themselves verification or rename verified topics to transfer credit.

Both standalone room forms now call the host's existing `create_room` and `join_room` RPCs. Creation atomically inserts the room and owner membership, generates the host's ten-character code, and retries a failed post-create room read without duplicating the room. Joining accepts the host's ten-character codes and older six-character codes, is case-insensitive/idempotent, and checks code possession on the server. The main app continues using the team's existing landing forms. Direct room/member inserts remain blocked. These RPCs use Supabase JS and do not change any shared columns.

Enable Postgres Changes for `syllabus_topics` if immediate dashboard updates are desired. Ten-second polling provides a fallback even without that publication. The dashboard displays red/amber/green cards with explicit text labels. The upcoming-exam banner uses calendar days in the browser timezone, includes today through seven days ahead, and lists every unverified topic. Past exams do not trigger that banner.

## Acceptance checks before a live demo

Automated tests cover signed-token tampering/expiry, AI-output validation, two-stage state transitions, status conflicts, import deduplication, room forms and post-create read retry, teach UI, and exam warnings. Supabase and Gemini calls in the new module's tests are mocked; no paid AI calls or hosted database writes were made.

With two real signed-in users and the host policies configured: create and join a room; paste a syllabus; verify that both dashboards update; teach a topic, answer correctly/incorrectly, and observe status/attribution; submit simultaneously to check conflict handling; deny outsiders; attempt a direct status update and confirm it fails; check the browser network bundle contains no Google/service-role/signing keys. Confirm model availability, account billing, and Vercel function execution in the actual project.

References: [Gemini generateContent API](https://ai.google.dev/api/generate-content), [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js).

For the practical activation checklist, see [AI setup](ai-setup.md). PDF references: [Gemini PDF support](https://ai.google.dev/gemini-api/docs/document-processing), [Vercel payload limits](https://vercel.com/docs/functions/limitations).
