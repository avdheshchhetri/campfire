# Local app integration

Run `npm ci`, configure the ignored `.env.local`, then run `npm run dev`. The default Vite server now runs the four existing authenticated API handlers as well as the frontend. Vercel still uses the original `api/` files directly. Restart the local server after changing server environment values.

Required public configuration: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Required server configuration: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and a random `TEACHING_SIGNING_SECRET` of at least 32 characters. The two Supabase URLs must identify the same project. Keep server secrets unprefixed by `VITE_` and out of Git.

Enable anonymous sign-ins in Supabase. Apply the six existing migrations once, in filename order, on a new database; inspect migration history before applying them to an existing database. These migrations retain the challenge engine's extra metadata columns and private answer tables. Keep RLS enabled.

The session page now links to `/room/:roomId/session/:sessionId/phone` and `/room/:roomId/session/:sessionId/shared`. All room members are included in the shared focus roster. Each member opens their phone page; use a separate laptop or tablet for the display. Phone writes use `phone_state` and refresh `updated_at`, with an insert-if-missing followed by a permitted-column update. The client checks active status before writing; the existing database policies do not enforce an active-session-only presence rule atomically.

Enable Postgres Changes for `sessions` and `session_presence` in Supabase for immediate database notifications; the client also reconciles periodically. Physical-phone sensors require a deployed HTTPS URL. Localhost only addresses this computer. Timer state is local to the display and resets on reload.

The challenge demo is explicitly simulated. Live Gemini generation still requires a real server key and service-role configuration. The existing challenge engine still uses the earlier clue distribution rules; the Phase 0 report's taught-topic, unrevealed-clue and hint-rotation findings remain outstanding. No new RLS changes were applied by this integration patch.
