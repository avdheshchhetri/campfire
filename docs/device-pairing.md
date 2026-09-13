# Main devices and distraction phones

The laptop keeps the existing guest identity, syllabus, teach-back, challenges, and leaderboard. A paired phone resolves a saved device token before the main auth provider mounts and opens only the secondary focus flow. No orientation listener or permission request runs in the main app. Old `/room/:roomId/session/:sessionId/phone` links now open pairing.

## Activate on your existing project

1. In the same Supabase project used by Vercel, open **SQL Editor → New query**. Apply `supabase/migrations/20260913000100_device_pairing.sql`. This assumes the repository's six earlier migrations have already been applied. Do not rerun the original shared-table creation script over an existing database.
2. The new migration adds `profiles.avatar_url` and `paired_devices`, grants avatar updates through the existing self-only policy, installs the four pairing RPCs, and adds `sessions` and `session_presence` to the existing Supabase Realtime publication. It keeps RLS enabled. It can be rerun safely on this migration's matching schema.
3. Confirm the SQL Editor reports success, then merge the device-pairing branch into `main` so Vercel builds the new app. Keep your existing environment variables; this feature needs no new keys or paid accounts.
4. Use the same stable HTTPS production domain on both laptop and phone. Different Vercel deployment URLs have separate browser storage, so a phone paired on a preview URL will need pairing again on the production domain.

If you use the Supabase CLI and its migration history is already accurate, `supabase db push` applies the pending migration instead. SQL Editor execution does not update CLI migration history automatically.

## Demo on two devices

1. On the laptop, open the production app. Choose **Skip, this is my own main device**. Existing guest sign-in is restored; a new guest chooses a name and one of six avatar presets. Existing users can change avatars under **Profile settings**.
2. Create or open a room. Choose **Add Distraction Device**. The six-character code and QR are generated together. Scan the QR on your phone, or enter the code at `/pair` on the same app domain, then tap **Pair this phone**. Do not create another guest profile on the phone.
3. Check that the phone shows the laptop owner's name and avatar. Start a session on the laptop. The phone discovers it within about five seconds; if several room sessions are active, choose the desired room in the phone's session selector.
4. On the phone tap **Enable Motion Detection** and grant permission if asked. Place it face-down. The phone indicator changes locally, and its changed state is written immediately. If sensors are unavailable, use **Simulate Face-Down**.
5. On the laptop, the room focus panel or **Shared focus screen** shows that person's phone. The timer runs only when all room members' phones are online and down. Lift one phone: that name is flagged and the timer pauses. The laptop itself remains usable for study and never requests motion permission.
6. Refresh the phone page. It restores the same pairing and owner without creating a new guest. Start with the phone up again, or re-enable simulation. End the session on the laptop and check that tracking stops.
7. Repeat with your teammates. Check syllabus upload/teach-back, a challenge, and leaderboard on the laptops. These existing flows retain their routes, data contracts, and scoring behavior.

Keep the phone tracking page visible and the screen unlocked: mobile browsers can suspend background or locked pages. A hidden page switches up and leaves Realtime Presence; a dropped connection pauses focus once the Realtime disconnect is detected. The display timer still resets on reload, as before.

## Implementation and data contracts

- `DeviceGate.jsx` checks `campfire.secondary.local_token` before `campfire.main_device`; a token takes priority even on a deep syllabus or challenge URL. Lookup failures offer retry or explicit re-pairing, never silently create another identity.
- `PairDevicePanel.jsx` generates the code and builds its QR locally using `qrcode.react`. The URL contains only the short code, never the permanent token. Both BrowserRouter and GitHub Pages HashRouter URLs are supported.
- `deviceApi.js` generates 32 random bytes (64 hex characters) with Web Crypto. It persists a pending claim before the request, so lost responses can safely retry the same code/token, then saves the successful token in localStorage.
- `create_device_pair(p_label)` requires the main user's Supabase login and returns `{id,pairing_code,created_at}`. Codes are readable, single-use, and expire after 15 minutes if unclaimed.
- `claim_device_pair(p_code,p_token)` atomically claims a code, stores `local_token` and `paired_at`, and returns the owner's profile. The same code/token retry is idempotent; another token cannot reclaim it.
- `resolve_device_pair(p_token)` returns `{device_id,user_id,display_name,avatar_url,sessions}`. Sessions include only active sessions in rooms where the owner is a member. The raw pairing table cannot be enumerated by browser clients.
- `set_device_presence(p_token,p_session_id,p_state)` accepts `up` or `down`, resolves the owner internally, locks and verifies membership/session activity, and writes only that owner's presence row. The phone supplies no editable `user_id` and receives no Supabase login token.
- `PhonePresencePage.jsx` is loaded only in the paired branch. Local orientation updates do not wait for the network. Face-down enters within 35 degrees of inverted-flat and leaves beyond 40 degrees, providing five degrees of hysteresis. State writes are immediate, serialized, deduplicated, and flush the latest state after an in-flight request. Only failures are retried on a timer; reconnect explicitly resyncs once. Five-second polling discovers lifecycle changes, not phone-state changes.
- `watchSession` listens to published database changes immediately and reads the existing `phone_state` column. Realtime Presence supplies connection liveness, since `updated_at` is no longer a periodic heartbeat. Public Realtime Presence metadata is a connection indicator, not authorization; token RPCs and table RLS enforce database writes.
- Avatar identifiers are `flame`, `leaf`, `book`, `moon`, `star`, and `mountain`. Existing null/unknown values have a preset fallback. The leaderboard still queries the original view and enriches avatars from room member profiles. Challenge snapshot contracts and private clues are preserved.

## Verification scope

Automated checks cover real PostgreSQL migration execution and RLS, pairing expiry/replay/isolation, avatar persistence, localStorage restoration, token-switch races, generated QR targets, main-route sensor isolation, sensor permission/fallback, immediate flip handling under slow writes, retries and cleanup, Realtime focus/timer behavior, and existing syllabus/challenge/leaderboard regressions. The production build includes a separate secondary-device chunk.

Local tests cannot confirm a particular phone's physical sensor behavior, hosted Supabase settings, or deployed network latency. After applying the migration and deployment, run the two-device checklist above over HTTPS before claiming a successful live demo.
