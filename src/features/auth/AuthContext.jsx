import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';

const AuthContext = createContext(null);
const profileRequests = new Map();

function asError(error) {
  return error instanceof Error ? error : new Error(error?.message || 'Something went wrong. Please try again.');
}

// Share pending requests across the development StrictMode mount cycle.
// DO NOTHING on conflicts preserves a member's existing display name.
function ensureProfile(user) {
  if (profileRequests.has(user.id)) return profileRequests.get(user.id);

  const request = (async () => {
    const displayName = user.user_metadata?.display_name?.trim() || 'Study partner';
    const { error: insertError } = await supabase.from('profiles').upsert(
      { id: user.id, display_name: displayName },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (insertError) throw asError(insertError);

    const { data, error } = await supabase.from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) throw asError(error);
    return data;
  })().finally(() => profileRequests.delete(user.id));

  profileRequests.set(user.id, request);
  return request;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState(null);
  const sessionRef = useRef(null);
  const lifecycle = useRef(0);
  const mounted = useRef(false);
  const signInRequest = useRef(null);

  const applySession = useCallback((nextSession) => {
    const previousId = sessionRef.current?.user?.id;
    const nextId = nextSession?.user?.id;
    sessionRef.current = nextSession;
    setSession(nextSession);

    if (previousId !== nextId) {
      setProfile(null);
      setError(null);
      setLoading(Boolean(nextId));
    } else if (!nextId) {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    lifecycle.current += 1;
    let active = true;
    let authEventVersion = 0;

    if (!supabase) {
      setLoading(false);
      return () => { mounted.current = false; lifecycle.current += 1; };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      authEventVersion += 1;
      // Keep this callback synchronous: profile requests run in the effect below.
      applySession(nextSession);
    });

    const restoreVersion = authEventVersion;
    supabase.auth.getSession().then(({ data, error: restoreError }) => {
      // A newer auth event takes precedence over a stale restoration response.
      if (!active || authEventVersion !== restoreVersion) return;
      if (restoreError) throw asError(restoreError);
      applySession(data.session);
    }).catch((restoreError) => {
      if (!active || authEventVersion !== restoreVersion) return;
      setError(asError(restoreError).message);
      setLoading(false);
    });

    return () => {
      active = false;
      mounted.current = false;
      lifecycle.current += 1;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const userId = session?.user?.id;
  useEffect(() => {
    const currentUser = sessionRef.current?.user;
    if (!currentUser || currentUser.id !== userId) return undefined;
    let active = true;
    setLoading(true);
    setError(null);

    ensureProfile(currentUser).then((nextProfile) => {
      if (active && sessionRef.current?.user?.id === currentUser.id) setProfile(nextProfile);
    }).catch((profileError) => {
      if (active && sessionRef.current?.user?.id === currentUser.id) setError(asError(profileError).message);
    }).finally(() => {
      if (active && sessionRef.current?.user?.id === currentUser.id) setLoading(false);
    });

    return () => { active = false; };
  }, [userId]);

  const signIn = useCallback((displayName) => {
    // Multiple submissions share one request and cannot create multiple guests.
    if (signInRequest.current) return signInRequest.current;
    const name = String(displayName ?? '').trim();
    const currentLifecycle = lifecycle.current;
    const isCurrent = () => mounted.current && lifecycle.current === currentLifecycle;
    setError(null);
    setLoading(true);

    const request = (async () => {
      if (!supabase) throw new Error('Connect Supabase before signing in.');
      if (!name || name.length > 60) throw new Error('Enter a display name between 1 and 60 characters.');

      // Recheck storage before creating a guest, including after a failed profile write.
      const { data: saved, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw asError(sessionError);
      let nextSession = saved.session;

      if (!nextSession) {
        const { data, error: authError } = await supabase.auth.signInAnonymously({
          options: { data: { display_name: name } },
        });
        if (authError) throw asError(authError);
        nextSession = data.session;
      }
      if (!nextSession?.user) throw new Error('Sign-in did not return a session. Please try again.');

      if (isCurrent()) applySession(nextSession);
      const nextProfile = await ensureProfile(nextSession.user);
      if (isCurrent() && sessionRef.current?.user?.id === nextSession.user.id) {
        setProfile(nextProfile);
        setError(null);
        setLoading(false);
      }
      return { session: nextSession, user: nextSession.user, profile: nextProfile };
    })().catch((signInError) => {
      const normalized = asError(signInError);
      if (isCurrent()) {
        setError(normalized.message);
        setLoading(false);
      }
      throw normalized;
    }).finally(() => {
      if (signInRequest.current === request) signInRequest.current = null;
    });

    signInRequest.current = request;
    return request;
  }, [applySession]);

  const retryProfile = useCallback(async () => {
    const currentUser = sessionRef.current?.user;
    if (!currentUser) throw new Error('Sign in before loading your profile.');
    const currentLifecycle = lifecycle.current;
    const isCurrent = () => mounted.current && lifecycle.current === currentLifecycle
      && sessionRef.current?.user?.id === currentUser.id;
    setLoading(true);
    setError(null);
    try {
      const nextProfile = await ensureProfile(currentUser);
      if (isCurrent()) setProfile(nextProfile);
      return nextProfile;
    } catch (profileError) {
      const normalized = asError(profileError);
      if (isCurrent()) setError(normalized.message);
      throw normalized;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const value = useMemo(() => ({
    session, user: session?.user ?? null, profile, loading, error, signIn, retryProfile, clearError,
  }), [session, profile, loading, error, signIn, retryProfile, clearError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
