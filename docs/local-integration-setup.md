# Local app integration

Run `npm ci`, configure the ignored `.env.local`, then run `npm run dev`. The default Vite server now runs the four existing authenticated API handlers as well as the frontend. Vercel still uses the original `api/` files directly. Restart the local server after changing server environment values.

Required public configuration: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Required server configuration: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and a random `TEACHING_SIGNING_SECRET` of at least 32 characters. The two Supabase URLs must identify the same project. Keep server secrets unprefixed by `VITE_` and out of Git.

Enable anonymous sign-ins in Supabase. Apply the six existing migrations once, in filename order, on a new database; inspect migration history before applying them to an existing database. These migrations retain the challenge engine's extra metadata columns and private answer tables. Keep RLS enabled.

The session page now links to `/room/:roomId/session/:sessionId/phone` and `/room/:roomId/session/:sessionId/shared`. All room members are included in the shared focus roster. Each member opens their phone page; use a separate laptop or tablet for the display. Phone writes use `phone_state` and refresh `updated_at`, with an insert-if-missing followed by a permitted-column update. The client checks active status before writing; the existing database policies do not enforce an active-session-only presence rule atomically.

Enable Postgres Changes for `sessions` and `session_presence` in Supabase for immediate database notifications; the client also reconciles periodically. Physical-phone sensors require a deployed HTTPS URL. Localhost only addresses this computer. Timer state is local to the display and resets on reload.

The challenge demo is explicitly simulated. Live Gemini generation still requires a real server key and service-role configuration. The existing challenge engine still uses the earlier clue distribution rules; the Phase 0 report's taught-topic, unrevealed-clue and hint-rotation findings remain outstanding. No new RLS changes were applied by this integration patch.

## Large PDF uploads

The syllabus uploader accepts PDFs up to 200 MiB and 1,000 pages. Small documents use the existing single-request route. Larger documents are prepared in a browser worker and split by page count and actual encoded byte size into at most 50 pages / 3 MiB per API call. Pages retain their original content; this is not guaranteed image compression to a target size. An individual page that still exceeds the batch byte limit is rejected with its page number.

Analysis prepares pages in a worker while running up to three AI requests concurrently, with completed-page progress and cancellation. Results are merged in document order even when requests finish out of order. The request count is unchanged, but the burst rate is higher and may encounter provider rate limits. Topic titles are deduplicated across batches, preserving first occurrence. Empty administrative batches are skipped; other failures stop the job without saving a partial topic list. The user reviews the combined list before inserting topics. Cancel stops further calls but cannot undo a provider request already received. Reloading does not resume analysis. Each batch consumes an AI request, and large documents may exceed quota or available browser memory; a desktop browser is recommended.

The server retains its original 3 MiB/50-page validation for every batch, so Vercel's body limit is respected and no storage bucket or public document URL is introduced. Google receives the individual PDF batches. Supabase still stores only the reviewed topic titles and progress.
