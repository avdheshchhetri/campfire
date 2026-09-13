import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';
import { ApiError, requiredEnv, adminClient } from '../syllabus/teachback.js';

const keySets = new Map();
export async function verifyIdentity(token) {
  const domain = requiredEnv('AUTH0_DOMAIN').trim();
  if (!/^[a-z0-9.-]+$/i.test(domain)) throw new ApiError(503, 'AUTH0_DOMAIN must be a hostname without https://.');
  const issuer = `https://${domain}/`;
  if (!keySets.has(issuer)) keySets.set(issuer, createRemoteJWKSet(new URL('.well-known/jwks.json', issuer)));
  const audience = requiredEnv('AUTH0_AUDIENCE');
  const clientId = requiredEnv('AUTH0_CLIENT_ID');
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keySets.get(issuer), {
      issuer, audience, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat'],
    }));
  } catch { throw new ApiError(401, 'Your Auth0 sign-in could not be verified. Sign in again.'); }
  if (payload.azp !== clientId || typeof payload.scope !== 'string' || !payload.scope.split(' ').includes('openid')) {
    throw new ApiError(401, 'Use this Campfire application to sign in.');
  }
  const response = await fetch(`${issuer}userinfo`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new ApiError(response.status === 401 ? 401 : 503, 'Auth0 could not complete your profile. Please retry.');
  const user = await response.json();
  if (!user.sub || user.sub !== payload.sub) throw new ApiError(401, 'Auth0 profile verification failed.');
  return { sub: user.sub, issuer, name: String(user.name || user.email || 'Study partner').slice(0, 60) };
}

function checkOwner(user, identity) {
  if (!user || user.app_metadata?.auth0_sub !== identity.sub || user.app_metadata?.auth0_issuer !== identity.issuer) {
    throw new ApiError(409, 'This identity needs account support. No existing account was linked.');
  }
}

// Supabase creates the backing auth.users UUID; all existing auth.uid() policies keep working.
// Never link by a matching email or trust a browser-provided profile UUID.
export async function resolveSession(identity, admin = adminClient(), redeem = redeemLink) {
  const lookup = await admin.from('profiles').select('id').eq('auth0_id', identity.sub).maybeSingle();
  if (lookup.error) throw new ApiError(503, 'Apply the Auth0 profile migration before signing in.');
  let email;
  if (lookup.data) {
    const result = await admin.auth.admin.getUserById(lookup.data.id);
    if (result.error) throw new ApiError(503, 'Could not load your account.');
    checkOwner(result.data.user, identity);
    email = result.data.user.email;
  } else {
    email = `${createHash('sha256').update(`${identity.issuer}\n${identity.sub}`).digest('hex')}@auth0.campfire.invalid`;
    const created = await admin.auth.admin.createUser({
      email, email_confirm: true,
      app_metadata: { auth0_sub: identity.sub, auth0_issuer: identity.issuer },
      user_metadata: { display_name: identity.name },
    });
    // A prior request may have provisioned the auth user before its profile was saved.
    if (created.error && !['email_exists', 'user_already_exists'].includes(created.error.code)) {
      throw new ApiError(503, 'Could not create your account. Please retry.');
    }
  }
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw new ApiError(503, 'Could not start your Campfire session.');
  const backingUser = link.data.user;
  checkOwner(backingUser, identity);
  if (lookup.data && backingUser.id !== lookup.data.id) throw new ApiError(409, 'Account identity mismatch.');
  if (!lookup.data) {
    const saved = await admin.from('profiles').upsert({
      id: backingUser.id, auth0_id: identity.sub, display_name: identity.name,
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (saved.error) throw new ApiError(503, 'Could not save your profile. Please retry.');
  }
  const profile = await admin.from('profiles').select('id,auth0_id').eq('id', backingUser.id).single();
  if (profile.error || profile.data?.auth0_id !== identity.sub) throw new ApiError(409, 'Account mapping could not be verified.');
  const session = await redeem(link.data.properties.hashed_token);
  if (session.user.id !== backingUser.id) throw new ApiError(409, 'Session identity mismatch.');
  return { access_token: session.access_token, refresh_token: session.refresh_token };
}

async function redeemLink(token_hash) {
  const client = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.verifyOtp({ token_hash, type: 'email' });
  if (error || !data.session) throw new ApiError(503, 'Could not finish sign-in. Please retry.');
  return data.session;
}
