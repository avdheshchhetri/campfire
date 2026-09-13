import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInAnonymously: vi.fn(),
  onAuthStateChange: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  readProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: mocks.getSession,
      signInAnonymously: mocks.signInAnonymously,
      onAuthStateChange: mocks.onAuthStateChange,
    },
    from: mocks.from,
  },
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function sessionFor(id, displayName = 'Ari', avatarUrl = 'flame') {
  return { access_token: `token-${id}`, user: { id, user_metadata: { display_name: displayName, avatar_url: avatarUrl } } };
}

let savedSession;
let profiles;
let listeners;
let subscriptions;

function emit(event, session) {
  savedSession = session;
  return [...listeners].map((callback) => callback(event, session));
}

function wrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  vi.resetAllMocks();
  savedSession = null;
  profiles = new Map();
  listeners = new Set();
  subscriptions = [];
  mocks.getSession.mockImplementation(async () => ({ data: { session: savedSession }, error: null }));
  mocks.onAuthStateChange.mockImplementation((callback) => {
    listeners.add(callback);
    const subscription = { unsubscribe: vi.fn(() => listeners.delete(callback)) };
    subscriptions.push(subscription);
    return { data: { subscription } };
  });
  mocks.signInAnonymously.mockImplementation(async ({ options }) => {
    const session = sessionFor('new-member', options.data.display_name, options.data.avatar_url);
    emit('SIGNED_IN', session);
    return { data: { session, user: session.user }, error: null };
  });
  mocks.upsert.mockImplementation(async (row, options) => {
    if (!profiles.has(row.id) || !options.ignoreDuplicates) profiles.set(row.id, row);
    return { error: null };
  });
  mocks.readProfile.mockImplementation(async (id) => ({ data: profiles.get(id), error: null }));
  mocks.updateProfile.mockImplementation(async (id, changes) => {
    const profile = profiles.has(id) ? { ...profiles.get(id), ...changes } : null;
    if (profile) profiles.set(id, profile);
    return { data: profile, error: null };
  });
  mocks.from.mockImplementation(() => {
    let userId;
    let changes;
    const query = {
      upsert: mocks.upsert,
      update: (value) => { changes = value; return query; },
      select: () => query,
      eq: (_column, id) => { userId = id; return query; },
      single: () => changes ? mocks.updateProfile(userId, changes) : mocks.readProfile(userId),
    };
    return query;
  });
});

afterEach(() => cleanup());

describe('AuthProvider', () => {
  it('restores the saved member in StrictMode, preserves their name, and cleans subscriptions', async () => {
    savedSession = sessionFor('restored', 'Old metadata name');
    profiles.set('restored', { id: 'restored', display_name: 'Updated profile name', avatar_url: 'moon' });
    const firstRestore = deferred();
    mocks.getSession.mockImplementationOnce(() => firstRestore.promise);
    const { result, unmount } = renderHook(() => useAuth(), { wrapper, reactStrictMode: true });

    await waitFor(() => expect(result.current.profile?.display_name).toBe('Updated profile name'));
    expect(result.current.loading).toBe(false);
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(
      { id: 'restored', display_name: 'Old metadata name', avatar_url: 'flame' },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    expect(result.current.profile.avatar_url).toBe('moon');

    await act(async () => {
      firstRestore.resolve({ data: { session: sessionFor('stale-restoration') }, error: null });
      await firstRestore.promise;
    });
    expect(result.current.user.id).toBe('restored');
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
    expect(subscriptions.every((subscription) => subscription.unsubscribe.mock.calls.length === 1)).toBe(true);
  });

  it('shares duplicate submissions, trims the display name, and creates one guest', async () => {
    const pendingSignIn = deferred();
    mocks.signInAnonymously.mockReturnValue(pendingSignIn.promise);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let first;
    let second;
    act(() => {
      first = result.current.signIn('  Maya  ', 'leaf');
      second = result.current.signIn('Another name');
    });
    expect(first).toBe(second);
    await waitFor(() => expect(mocks.signInAnonymously).toHaveBeenCalledTimes(1));
    expect(mocks.signInAnonymously).toHaveBeenCalledWith({ options: { data: { display_name: 'Maya', avatar_url: 'leaf' } } });

    const session = sessionFor('duplicate-submit', 'Maya', 'leaf');
    await act(async () => {
      emit('SIGNED_IN', session);
      pendingSignIn.resolve({ data: { session, user: session.user }, error: null });
      await first;
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toMatchObject({ id: 'duplicate-submit', display_name: 'Maya', avatar_url: 'leaf' });
    expect(result.current.error).toBeNull();
  });

  it('recovers a failed profile write without creating another anonymous account', async () => {
    const failedWrite = deferred();
    mocks.upsert.mockImplementationOnce(() => failedWrite.promise);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let signIn;
    act(() => { signIn = result.current.signIn('Ari'); });
    const rejection = expect(signIn).rejects.toThrow('Profile access denied');
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    await act(async () => {
      failedWrite.resolve({ error: { message: 'Profile access denied' } });
      await rejection;
    });
    await waitFor(() => expect(result.current.error).toBe('Profile access denied'));
    expect(result.current.user.id).toBe('new-member');
    expect(result.current.profile).toBeNull();

    await act(async () => { await result.current.retryProfile(); });
    expect(result.current.profile.display_name).toBe('Ari');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mocks.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('does not replace a newer auth event with a late restoration response', async () => {
    const restoration = deferred();
    mocks.getSession.mockReturnValue(restoration.promise);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { emit('SIGNED_IN', sessionFor('current-member', 'Noor')); });
    await waitFor(() => expect(result.current.profile?.display_name).toBe('Noor'));
    await act(async () => {
      restoration.resolve({ data: { session: null }, error: null });
      await restoration.promise;
    });
    expect(result.current.user.id).toBe('current-member');
    expect(result.current.profile.display_name).toBe('Noor');
  });

  it('keeps auth callbacks synchronous and ignores a profile response after sign-out', async () => {
    const pendingProfile = deferred();
    mocks.readProfile.mockReturnValueOnce(pendingProfile.promise);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      const callCount = mocks.from.mock.calls.length;
      expect(emit('SIGNED_IN', sessionFor('signed-out-member'))).toEqual([undefined]);
      expect(mocks.from).toHaveBeenCalledTimes(callCount);
    });
    await waitFor(() => expect(mocks.readProfile).toHaveBeenCalledTimes(1));
    act(() => { emit('SIGNED_OUT', null); });
    await act(async () => {
      pendingProfile.resolve({ data: { id: 'signed-out-member', display_name: 'Ari' }, error: null });
      await pendingProfile.promise;
    });
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('rejects an empty name before contacting auth and clears the error on a valid retry', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.signIn('  ')).rejects.toThrow('display name'); });
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
    expect(result.current.error).toContain('display name');
    await act(async () => { await result.current.signIn('Riley'); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile.display_name).toBe('Riley');
    expect(result.current.error).toBeNull();
  });

  it('reuses an existing session when a sign-in form is submitted before restoration finishes', async () => {
    const restoration = deferred();
    savedSession = sessionFor('already-signed-in', 'Saved name', 'book');
    mocks.getSession.mockImplementationOnce(() => restoration.promise);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await result.current.signIn('Different name', 'moon'); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
    expect(result.current.profile.display_name).toBe('Saved name');
    expect(result.current.profile.avatar_url).toBe('book');
    await act(async () => {
      restoration.resolve({ data: { session: savedSession }, error: null });
      await restoration.promise;
    });
    expect(result.current.user.id).toBe('already-signed-in');
  });

  it('updates only the signed-in member avatar and restores it after a remount', async () => {
    savedSession = sessionFor('avatar-member', 'Ari', 'leaf');
    const first = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(first.result.current.profile?.avatar_url).toBe('leaf'));
    await act(async () => { await first.result.current.updateAvatar('moon'); });
    expect(mocks.updateProfile).toHaveBeenCalledWith('avatar-member', { avatar_url: 'moon' });
    expect(first.result.current.profile).toMatchObject({ id: 'avatar-member', display_name: 'Ari', avatar_url: 'moon' });
    first.unmount();
    const restored = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(restored.result.current.profile?.avatar_url).toBe('moon'));
    expect(restored.result.current.profile.display_name).toBe('Ari');
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it('keeps the saved profile when an avatar change fails and rejects unknown presets', async () => {
    savedSession = sessionFor('avatar-member', 'Ari', 'book');
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.profile?.avatar_url).toBe('book'));
    mocks.updateProfile.mockResolvedValueOnce({ data: null, error: { message: 'Avatar update denied' } });
    await act(async () => { await expect(result.current.updateAvatar('leaf')).rejects.toThrow('Avatar update denied'); });
    expect(result.current.profile.avatar_url).toBe('book');
    await act(async () => { await expect(result.current.updateAvatar('https://example.com/avatar.png')).rejects.toThrow('available avatars'); });
    expect(mocks.updateProfile).toHaveBeenCalledTimes(1);
  });

  it('does not apply an avatar response after the member signs out', async () => {
    savedSession = sessionFor('avatar-member', 'Ari', 'star');
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.profile?.avatar_url).toBe('star'));
    const pending = deferred();
    mocks.updateProfile.mockReturnValueOnce(pending.promise);
    let update;
    act(() => { update = result.current.updateAvatar('mountain'); });
    act(() => { emit('SIGNED_OUT', null); });
    await act(async () => {
      pending.resolve({ data: { id: 'avatar-member', display_name: 'Ari', avatar_url: 'mountain' }, error: null });
      await update;
    });
    expect(result.current.profile).toBeNull();
    expect(result.current.user).toBeNull();
    await expect(result.current.updateAvatar('leaf')).rejects.toThrow('Sign in');
  });
});
