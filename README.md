# Campfire

Campfire Mode is the group focus feature: a shared timer runs while every participant's phone is face-down.

The phone-presence React module lives in `src/campfire/`. It imports the existing named `supabase` export from `src/supabaseClient.js`; the parent app supplies authentication, routing, and the shared schema.

The collaborative challenge engine lives in `src/features/challenges/`. Groups of 3–6 receive private puzzle pieces, talk through their clues, and submit a shared answer. Its Supabase migration provides private clue access and server-side answer checking.

## Run the challenge demo

```sh
pnpm install --frozen-lockfile
pnpm run dev
pnpm test
pnpm run build
```

The Vite entry point runs a labeled local challenge demo with simulated participants. It does not connect to Supabase or mount the phone-presence module. Live integration requires the host app's authenticated Supabase client, room/session context, shared schema, and access policies.

See [challenge-engine handoff](docs/challenge-engine-handoff.md) for component props, migration setup, security boundaries, and live testing instructions. The three included puzzles cover circuits, arithmetic mean, and logic.

## Existing phone-presence feature

See `docs/section-b-handoff.md` for component props, expected database fields, access policies, Realtime setup, integration responsibilities, and known timing limits.

Run utility tests with `node --test src/campfire/section-b.test.mjs`.

## Shared-schema integration note

The existing phone-presence module expects `session_presence.state`; the supplied shared schema names this field `phone_state`. The backend/integration owner must align that contract before running phone presence. The challenge engine uses only `session_id` and `user_id` from presence and does not alter either state field. Existing phone-presence code is preserved by this contribution.
