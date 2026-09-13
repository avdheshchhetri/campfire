import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ verify: vi.fn(), jwks: vi.fn() }));
vi.mock('jose', () => ({ jwtVerify: mocks.verify, createRemoteJWKSet: mocks.jwks }));
import { resolveSession, verifyIdentity } from './auth0.js';
const identity = { sub: 'google-oauth2|123', issuer: 'https://tenant.auth0.com/', name: 'Alex' };
const owner = { id: 'uuid-from-supabase', email: 'internal@auth0.campfire.invalid', app_metadata: { auth0_sub: identity.sub, auth0_issuer: identity.issuer } };
function fixture(existing = false) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing ? { id: owner.id } : null });
  const single = vi.fn().mockResolvedValue({ data: { id: owner.id, auth0_id: identity.sub } });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle, single }) }), upsert }));
  const auth = { admin: {
    getUserById: vi.fn().mockResolvedValue({ data: { user: owner } }),
    createUser: vi.fn().mockResolvedValue({ data: { user: owner } }),
    generateLink: vi.fn().mockResolvedValue({ data: { user: owner, properties: { hashed_token: 'one-time-hash' } } }),
  } };
  const redeem = vi.fn().mockResolvedValue({ user: owner, access_token: 'access', refresh_token: 'refresh' });
  return { admin: { from, auth }, redeem, upsert, single, maybeSingle };
}
beforeEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('Auth0 UUID bridge', () => {
  it('uses the Supabase-generated UUID and trusted name for a new profile', async () => {
    const f = fixture();
    expect(await resolveSession(identity, f.admin, f.redeem)).toEqual({ access_token: 'access', refresh_token: 'refresh' });
    expect(f.upsert).toHaveBeenCalledWith({ id: owner.id, auth0_id: identity.sub, display_name: 'Alex' }, { onConflict: 'id', ignoreDuplicates: true });
    expect(f.admin.auth.admin.createUser.mock.calls[0][0].email).toMatch(/^[a-f0-9]{64}@auth0\.campfire\.invalid$/);
    expect(f.redeem).toHaveBeenCalledWith('one-time-hash');
  });
  it('reuses the mapped UUID without overwriting the display name or avatar', async () => {
    const f = fixture(true); await resolveSession(identity, f.admin, f.redeem);
    expect(f.admin.auth.admin.getUserById).toHaveBeenCalledWith(owner.id);
    expect(f.upsert).not.toHaveBeenCalled(); expect(f.admin.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it('rejects a forged mapping before creating a login link', async () => {
    const f = fixture(true);
    f.admin.auth.admin.getUserById.mockResolvedValue({ data: { user: { ...owner, app_metadata: {} } } });
    await expect(resolveSession(identity, f.admin, f.redeem)).rejects.toMatchObject({ status: 409 });
    expect(f.admin.auth.admin.generateLink).not.toHaveBeenCalled(); expect(f.redeem).not.toHaveBeenCalled();
  });
  it('does not redeem a link for a preclaimed internal email', async () => {
    const f = fixture();
    f.admin.auth.admin.createUser.mockResolvedValue({ error: { code: 'email_exists' } });
    f.admin.auth.admin.generateLink.mockResolvedValue({ data: { user: { ...owner, app_metadata: {} } } });
    await expect(resolveSession(identity, f.admin, f.redeem)).rejects.toMatchObject({ status: 409 });
    expect(f.redeem).not.toHaveBeenCalled();
  });
  it('recovers provisioning interrupted before the profile insert', async () => {
    const f = fixture(); f.admin.auth.admin.createUser.mockResolvedValue({ error: { code: 'email_exists' } });
    await resolveSession(identity, f.admin, f.redeem); expect(f.upsert).toHaveBeenCalledOnce();
  });
  it('does not mint a session if the database mapping fails', async () => {
    const f = fixture(); f.single.mockResolvedValue({ data: { auth0_id: 'someone-else' } });
    await expect(resolveSession(identity, f.admin, f.redeem)).rejects.toMatchObject({ status: 409 });
    expect(f.redeem).not.toHaveBeenCalled();
  });
});
describe('Auth0 verification', () => {
  beforeEach(() => {
    process.env.AUTH0_DOMAIN = 'tenant.auth0.com'; process.env.AUTH0_CLIENT_ID = 'campfire'; process.env.AUTH0_AUDIENCE = 'campfire-api';
    mocks.verify.mockResolvedValue({ payload: { sub: identity.sub, azp: 'campfire', scope: 'openid profile email' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sub: identity.sub, name: 'Alex' }) }));
  });
  it('enforces issuer, audience and RS256 before trusting userinfo', async () => {
    expect(await verifyIdentity('token')).toEqual(identity);
    expect(mocks.verify).toHaveBeenCalledWith('token', undefined, expect.objectContaining({ issuer: identity.issuer, audience: 'campfire-api', algorithms: ['RS256'] }));
  });
  it('rejects invalid or expired JWTs before contacting userinfo', async () => {
    mocks.verify.mockRejectedValue(new Error('invalid'));
    await expect(verifyIdentity('bad')).rejects.toMatchObject({ status: 401 }); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects a token issued for another application', async () => {
    mocks.verify.mockResolvedValue({ payload: { sub: identity.sub, azp: 'other', scope: 'openid' } });
    await expect(verifyIdentity('bad')).rejects.toMatchObject({ status: 401 }); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects a mismatched userinfo identity', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ sub: 'other' }) });
    await expect(verifyIdentity('bad')).rejects.toMatchObject({ status: 401 });
  });
});
