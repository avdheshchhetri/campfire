import { supabase } from '../../supabaseClient.js';

export async function startSession(roomId) {
  if (!roomId) throw new Error('A room is required.');
  const { data, error } = await supabase.from('sessions')
    .insert({ room_id: roomId, is_active: true }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function endSession(sessionId) {
  const { data, error } = await supabase.from('sessions')
    .update({ ended_at: new Date().toISOString(), is_active: false })
    .eq('id', sessionId).eq('is_active', true).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Session already ended or update not permitted.');
}

export async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Sign in before joining this session.');
  return data.user.id;
}

export async function writeState(sessionId, userId, state) {
  if (!['up', 'down'].includes(state)) throw new Error('Invalid phone state.');
  const session = await supabase.from('sessions').select('is_active,ended_at')
    .eq('id', sessionId).single();
  if (session.error) throw session.error;
  if (!session.data.is_active || session.data.ended_at) throw new Error('This session has ended.');
  const inserted = await supabase.from('session_presence').upsert(
    { session_id: sessionId, user_id: userId },
    { onConflict: 'session_id,user_id', ignoreDuplicates: true },
  );
  if (inserted.error) throw inserted.error;
  const { data, error } = await supabase.from('session_presence')
    .update({ phone_state: state, updated_at: new Date().toISOString() })
    .eq('session_id', sessionId).eq('user_id', userId).select('user_id');
  if (error) throw error;
  if (!data?.length) throw new Error('Could not save your phone state. Rejoin the room.');
}

// Both screens use the same topic. Realtime Presence supplies connection liveness;
// Postgres remains the source of truth for down/up state.
export function watchSession(sessionId, { userId, onSnapshot, onOnline, onStatus }) {
  let closed = false, connected = false, loading = false, dirty = false;
  const channel = supabase.channel(`campfire:${sessionId}`);
  async function refresh() {
    if (closed || !connected) return;
    dirty = true;
    if (loading) return;
    loading = true;
    try {
      while (dirty && !closed && connected) {
        dirty = false;
        const [session, presence] = await Promise.all([
          supabase.from('sessions').select('id,is_active,ended_at')
            .eq('id', sessionId).single(),
          supabase.from('session_presence').select('user_id,phone_state')
            .eq('session_id', sessionId),
        ]);
        if (session.error) throw session.error;
        if (presence.error) throw presence.error;
        // A change during the fetch invalidates its results. Fetch again.
        if (!dirty && !closed && connected) {
          onSnapshot(session.data, presence.data.map(row => ({ ...row, state: row.phone_state })));
          onStatus('ready');
        }
      }
    } catch (error) {
      if (!closed) onStatus('error', error.message);
    } finally { loading = false; }
  }
  const changed = () => { if (!closed) { onStatus('syncing'); void refresh(); } };
  channel
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'session_presence',
      filter: `session_id=eq.${sessionId}`,
    }, changed)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}`,
    }, changed)
    .on('presence', { event: 'sync' }, () => {
      if (!closed) onOnline(new Set(Object.values(channel.presenceState())
        .flat().map(entry => entry.user_id).filter(Boolean)));
    })
    .subscribe(async status => {
      if (closed) return;
      connected = status === 'SUBSCRIBED';
      onStatus(connected ? 'syncing' : 'disconnected');
      if (connected) {
        if (userId) {
          const result = await channel.track({ user_id: userId });
          if (closed) return;
          if (result !== 'ok') { onStatus('error', 'Could not register this phone.'); return; }
        }
        void refresh();
      } else { onOnline(new Set()); }
    });
  // Reconciliation also catches deletions and recovers a failed snapshot read.
  const poll = setInterval(() => void refresh(), 5000);
  return () => {
    closed = true;
    clearInterval(poll);
    void supabase.removeChannel(channel);
  };
}
