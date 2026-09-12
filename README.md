# Campfire — Section B

Campfire Mode is the group focus feature: a shared timer runs while every participant's phone is face-down.

The React + Tailwind module lives in `src/campfire/`. It imports the existing named `supabase` export from `src/supabaseClient.js`; the parent app supplies Vite, React, Tailwind, authentication, routing, and the shared schema. This repository currently contains Section B, not a complete runnable application.

See `docs/section-b-handoff.md` for component props, expected database fields, access policies, Realtime setup, integration responsibilities, and known timing limits.

Run utility tests with `node --test src/campfire/section-b.test.mjs`.
