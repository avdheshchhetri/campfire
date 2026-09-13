import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: {}, getUser: vi.fn(), setSession: vi.fn(), signOut: vi.fn() }));
vi.mock('@auth0/auth0-react', () => ({ Auth0Provider: ({ children }) => children, useAuth0: () => mocks.auth }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: mocks } }));
vi.stubEnv('VITE_AUTH0_DOMAIN', 'tenant.auth0.com');
vi.stubEnv('VITE_AUTH0_CLIENT_ID', 'client');
vi.stubEnv('VITE_AUTH0_AUDIENCE', 'api');
const { default: Provider, Auth0LoginButton, useIdentity } = await import('./Auth0Login');
function Controls() {
  const identity = useIdentity();
  return <><p>Room content</p><Auth0LoginButton /><button onClick={identity.logout}>Logout</button></>;
}
beforeEach(() => {
  mocks.auth = { isLoading: false, isAuthenticated: false, user: null,
    getAccessTokenSilently: vi.fn().mockResolvedValue('verified-auth0-token'), loginWithRedirect: vi.fn().mockResolvedValue(), logout: vi.fn().mockResolvedValue() };
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.setSession.mockResolvedValue({ data: {}, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'supabase-token', refresh_token: 'supabase-refresh' }) }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
afterAll(() => vi.unstubAllEnvs());
it('opens Universal Login and logs out from both systems', async () => {
  render(<Provider><Controls /></Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Log in or sign up with Auth0' }));
  expect(mocks.auth.loginWithRedirect).toHaveBeenCalled();
  fireEvent.click(screen.getByText('Logout'));
  await waitFor(() => expect(mocks.auth.logout).toHaveBeenCalled());
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
it('holds protected content until the Supabase session is connected', async () => {
  mocks.auth.isAuthenticated = true; mocks.auth.user = { sub: 'auth0|person' };
  render(<Provider><Controls /></Provider>);
  expect(screen.queryByText('Room content')).toBeNull();
  await screen.findByText('Room content');
  expect(mocks.setSession).toHaveBeenCalledWith({ access_token: 'supabase-token', refresh_token: 'supabase-refresh' });
  expect(fetch).toHaveBeenCalledWith('/api/auth0-session', expect.objectContaining({ body: '{}', headers: expect.objectContaining({ Authorization: 'Bearer verified-auth0-token' }) }));
});
it('keeps a failed bridge closed and allows retry', async () => {
  mocks.auth.isAuthenticated = true; mocks.auth.user = { sub: 'auth0|person' };
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Apply the Auth0 migration.' }) });
  render(<Provider><Controls /></Provider>);
  await screen.findByText('Apply the Auth0 migration.');
  expect(screen.queryByText('Room content')).toBeNull(); expect(mocks.setSession).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Try again'));
  await screen.findByText('Room content');
});
it('reuses an authenticated matching Supabase session after reload', async () => {
  mocks.auth.isAuthenticated = true; mocks.auth.user = { sub: 'auth0|person' };
  mocks.getUser.mockResolvedValue({ data: { user: { app_metadata: { auth0_sub: 'auth0|person', auth0_issuer: 'https://tenant.auth0.com/' } } } });
  render(<Provider><Controls /></Provider>); await screen.findByText('Room content');
  expect(fetch).not.toHaveBeenCalled(); expect(mocks.setSession).not.toHaveBeenCalled();
});
