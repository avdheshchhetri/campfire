import { createContext, useContext, useEffect, useState } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { supabase } from '../../lib/supabaseClient';

const domain = import.meta.env.VITE_AUTH0_DOMAIN?.trim();
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID?.trim();
const audience = import.meta.env.VITE_AUTH0_AUDIENCE?.trim();
const enabled = Boolean(domain && clientId && audience);
const IdentityContext = createContext({ enabled: false });
export const useIdentity = () => useContext(IdentityContext);
const pending = new Map();

async function connect(getAccessTokenSilently, sub) {
  const current = await supabase.auth.getUser();
  if (current.data.user?.app_metadata?.auth0_sub === sub &&
      current.data.user?.app_metadata?.auth0_issuer === `https://${domain}/`) return null;
  const token = await getAccessTokenSilently();
  const response = await fetch('/api/auth0-session', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}', signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not connect Auth0 to Campfire. Please retry.');
  return result;
}

function ConnectedIdentity({ children }) {
  const auth = useAuth0();
  const [ready, setReady] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const sub = auth.isAuthenticated ? auth.user?.sub : null;
  useEffect(() => {
    if (!sub || auth.isLoading) return;
    let active = true;
    setError('');
    if (!pending.has(sub)) {
      const request = connect(auth.getAccessTokenSilently, sub).finally(() => pending.delete(sub));
      pending.set(sub, request);
    }
    pending.get(sub).then(async session => {
      if (!active) return;
      if (session) {
        const result = await supabase.auth.setSession(session);
        if (result.error) throw result.error;
      }
      if (active) setReady(sub);
    }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [sub, auth.isLoading, auth.getAccessTokenSilently, attempt]);
  const login = () => auth.loginWithRedirect({ appState: { returnTo: window.location.pathname + window.location.search } });
  const logout = async () => {
    const result = await supabase.auth.signOut({ scope: 'local' });
    if (result.error) throw result.error;
    setReady(null);
    await auth.logout({ logoutParams: { returnTo: window.location.origin } });
  };
  const problem = error || auth.error?.message;
  return <IdentityContext.Provider value={{ enabled: true, login, logout, identity: auth.user }}>
    {problem ? <section className="panel mx-auto max-w-xl p-7 space-y-5">
      <h1 className="font-display text-3xl">Let’s finish signing in</h1>
      <p role="alert" className="error-banner">{problem}</p>
      <button className="button" onClick={() => auth.error ? login().catch(e => setError(e.message)) : setAttempt(value => value + 1)}>Try again</button>
      <button className="button button-secondary" onClick={() => logout().catch(e => setError(e.message))}>Sign out</button>
    </section> : auth.isLoading || (sub && ready !== sub) ? <section className="panel mx-auto max-w-xl p-7" role="status">Connecting your Campfire account…</section> : children}
  </IdentityContext.Provider>;
}

export default function CampfireAuth0({ children }) {
  if (!enabled) return children;
  if (import.meta.env.VITE_GITHUB_PAGES === 'true') return <section className="panel p-7">Auth0 requires the full Campfire deployment with its API server.</section>;
  return <Auth0Provider domain={domain} clientId={clientId}
    authorizationParams={{ redirect_uri: window.location.origin, audience, scope: 'openid profile email' }}
    onRedirectCallback={state => {
      const path = state?.returnTo;
      window.history.replaceState({}, '', typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? path : '/');
    }}>
    <ConnectedIdentity>{children}</ConnectedIdentity>
  </Auth0Provider>;
}

export function Auth0LoginButton() {
  const { login } = useIdentity();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="space-y-5">
    <button type="button" className="button w-full justify-center" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await login(); } catch (cause) { setError(cause.message); setBusy(false); }
    }}>{busy ? 'Opening sign-in…' : 'Log in or sign up with Auth0'}</button>
    <p className="muted text-sm">Choose Google or another enabled sign-in method on the secure login screen.</p>
    {error && <p role="alert" className="error-banner">{error}</p>}
  </div>;
}
