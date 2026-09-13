# Auth0 login and the existing Supabase UUIDs

Auth0 is an optional replacement for the visible login flow. With all three public Auth0 settings present, Campfire uses Universal Login. Without them, the existing Supabase guest/email login remains available. Avatars, room membership, scores, quizzes, and other features continue to use the same Supabase client and UUID identity interface.

## Set up the dashboard

1. In Auth0, create an application of type **Single Page Application**. Copy its Domain (hostname only) and Client ID.
2. Under **APIs**, create a Campfire API with an identifier such as `https://campfire-api` and signing algorithm **RS256**. Use that identifier as the audience. Use Auth0's access-token profile (the bridge checks its `azp` application claim).
3. In the application's settings, add your exact local and deployed origins to **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins**. For local development this is `http://127.0.0.1:5173`; add the actual HTTPS Vercel origin for deployment. The callback is the root URL, not `/account`. Do not add wildcards.
4. Enable the **Google** social connection for this application under **Authentication → Social → Google → Applications**. Configure Google's OAuth credentials for your connection as described in [Auth0's Google setup guide](https://auth0.com/docs/authenticate/identity-providers/social-identity-providers/google). The Google button then appears on Universal Login. This is the additional sponsor feature; installing the SDK does not enable the dashboard connection automatically.
5. Keep Supabase's **Email** provider enabled: the server exchanges a generated, single-use login token for a normal Supabase session. It does not send login emails to the internal account address.

## Environment values

Add these to the repository-root `.env.local` for development, or Vercel **Settings → Environment Variables** for the deployed app. Restart development/redeploy after changes.

```dotenv
# Public configuration; these values are not secrets.
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your_spa_client_id
VITE_AUTH0_AUDIENCE=https://campfire-api

# Server verification configuration: must match the three values above.
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your_spa_client_id
AUTH0_AUDIENCE=https://campfire-api
```

Keep the existing server `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and **secret** `SUPABASE_SERVICE_ROLE_KEY`. Keep the existing client `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. An Auth0 SPA client secret is **not required**; do not add one to Vite. The Auth0 SDK keeps its tokens in memory with its default configuration. The existing Supabase session persistence remains unchanged.

Auth0 needs the frontend and `/api/auth0-session` on the same origin. GitHub Pages cannot run this route. Use the complete Vercel deployment or the local Vite server.

## Apply the migration

After earlier migrations, run the full contents of [`20260913000900_auth0_profiles.sql`](../supabase/migrations/20260913000900_auth0_profiles.sql) in **Supabase → SQL Editor → New query → Run**. It adds only `profiles.auth0_id text unique`, plus an insert policy on that same table to prevent browser-created identity mappings. The existing UUID primary key, foreign key, columns, and other tables remain unchanged.

## Request flow

1. The login button calls `loginWithRedirect()`; Auth0 handles login/social consent and returns to Campfire.
2. The SDK obtains an access token for the configured Campfire API. The browser sends it as a Bearer token to `/api/auth0-session`.
3. The route validates the JWT signature against Auth0 JWKS, issuer, audience, expiry, RS256 algorithm, application ID, and OpenID scope. It fetches the matching Auth0 `/userinfo` profile. Browser-supplied identity fields are not used.
4. The server looks up `profiles.auth0_id`. New identities get a Supabase Auth user first, with a deterministic internal email and server-owned identity metadata. **Supabase generates the UUID**, ensuring `profiles.id → auth.users.id` remains valid. The server then inserts the profile using that UUID, Auth0 sub, and trusted name/email. Returning users retain their display name and avatar.
5. The server verifies the backing user's protected identity metadata before redeeming a single-use generated login link. It returns only the Supabase session tokens with `Cache-Control: no-store`.
6. The browser calls `supabase.auth.setSession()`. Existing `AuthContext` loads the profile; its `user.id` and `profile.id` are the same UUID. All existing `auth.uid()` permissions and authenticated API requests keep working.
7. Account sign-out clears the local Supabase session and calls Auth0 `logout()`. The avatar picker remains unchanged; Auth0 accounts no longer show the Supabase password editor or their internal email address.

The bridge does **not** automatically merge an old guest/email account with an Auth0 account by email. Existing accounts and data remain intact; first-time Auth0 sign-in creates a separate account. Retaining a particular old account's memberships under Auth0 would require an explicit account-linking flow with proof of both identities. Do not manually assign another person's UUID or edit `auth0_id` to attempt linking.

Supabase sessions have their own lifetime after the exchange. Blocking an Auth0 user does not automatically revoke previously issued Supabase sessions; account revocation must also be performed in Supabase. Switching Auth0 tenants likewise requires an intentional identity migration, not just changing the domain variable.

## Files and verification

- [`Auth0Login.jsx`](../src/features/auth/Auth0Login.jsx): provider, redirect callback, session connection, login button, logout action.
- [`App.jsx`](../src/App.jsx): outer provider around the unchanged Supabase auth context.
- [`SignIn.jsx`](../src/features/auth/SignIn.jsx) and [`Account.jsx`](../src/pages/Account.jsx): Auth0 controls when configured, existing controls otherwise.
- [`api/auth0-session.js`](../api/auth0-session.js) and [`server/auth/auth0.js`](../server/auth/auth0.js): verified identity exchange.
- [`server/dev/localApi.js`](../server/dev/localApi.js): the same route available locally.

After setup, test Google login, select an avatar, create/join a room, sign out, and sign back in. Confirm the **same** profile UUID and room memberships return. Test in a second browser too. Existing automated tests cover bridge validation, repeat identity resolution, ownership checks, mapping write protection, and unchanged database feature policies. A real Auth0/Google sign-in still needs the dashboard configuration above.

Reference: [Auth0 React SDK](https://auth0.com/docs/libraries/auth0-react), [Supabase admin generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).
