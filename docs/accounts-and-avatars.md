# Accounts and avatars

Previously Campfire supported name-based anonymous guest sessions and initials only. Restored sessions skip the name form. A photo/avatar picker was not removed by the theme update.

## Available UI

- Visitors: choose **Log in or create an account** above the guest name form.
- Signed-in users: click your name/avatar in the header to open **Account**.
- Email/password login and registration use Supabase Auth, with confirmation instructions when required.
- Guests upgrade in two steps: verify an email, then return to Account to set a password. This retains the existing user ID, rooms, and progress. Linking to an already-existing account does not merge its data.
- Account offers a built-in avatar picker (initials, flame, fox, owl, rocket, leaf, star). No file uploads or third-party avatar services are required.
- Chosen avatars display in the header, focus roster, challenge circle, and leaderboard. Unknown/missing avatars fall back to initials.
- Passwords go directly to Supabase Auth, never into app tables or localStorage. Supabase manages session persistence.

## Required Supabase setup

1. In Authentication, enable the **Email** provider and keep email confirmation enabled as appropriate for your project.
2. Enable **manual identity linking** to support guest upgrades. Guests verify their email before adding a password.
3. Set the production Site URL and allowed Redirect URLs to your actual website root, including `/campfire/` for GitHub Pages. Include the local development address if needed.
4. Run `supabase/migrations/20260913000100_profile_avatars.sql` in the project's SQL editor (or use your normal migration deployment).

The migration adds only `profiles.avatar_key` and permission to update that column. Existing self-only update and room-scoped read policies remain active. It does not modify existing profile IDs, room membership, or scores. Account-local avatars can save to Auth metadata before this migration; the UI explicitly reports that shared avatars still need setup.

Deployment does not automatically apply Supabase migrations. These dashboard settings and production email delivery have not been verified or changed by this code update. Live signup emails were not sent during development.

Official reference: https://supabase.com/docs/guides/auth/auth-anonymous
