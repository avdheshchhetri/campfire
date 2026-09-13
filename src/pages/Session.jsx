import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import SessionChallenges from '../features/challenges/SessionChallenges.jsx';
import FocusPanel from '../campfire/FocusPanel.jsx';

export default function Session({ view = 'overview' }) {
  const { roomId, sessionId } = useParams();
  const { refreshRoom } = useOutletContext();
  const [state, setState] = useState({ loading: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    let loading = false;
    setState({ loading: true });
    async function refresh() {
      if (loading) return;
      loading = true;
      try {
        const { data, error } = await supabase.from('sessions').select('*')
          .eq('id', sessionId).eq('room_id', roomId).maybeSingle();
        if (error) throw error;
        if (current) setState({ session: data, loading: false });
      } catch (error) {
        if (current) setState(previous => ({ ...previous, error: error.message, loading: false }));
      } finally { loading = false; }
    }
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { current = false; clearInterval(timer); };
  }, [roomId, sessionId, revision]);
  const base = `/room/${roomId}/session/${sessionId}`;
  if (state.loading) return <p className="empty-state" role="status">Opening the session…</p>;
  if (state.error || !state.session || !state.session.is_active || state.session.ended_at) return <section className="panel empty-state">
    <h1 className="page-heading">{state.error ? 'Couldn’t load this session' : !state.session ? 'This session isn’t here' : 'This session has ended'}</h1>
    <p className="muted my-5" role={state.error ? 'alert' : undefined}>{state.error || 'Return to your room to start or join another session.'}</p>
    {state.error && <button className="button mr-3" onClick={() => setRevision(value => value + 1)}>Try again</button>}
    <Link className="button button-secondary" to={`/room/${roomId}`}>Back to room</Link>
  </section>;
  return <>
    <h1 className="page-heading mb-6">Your group’s focus space</h1>
    <nav aria-label="Session views" className="flex flex-wrap gap-3 mb-6">
      <Link className="button button-secondary" to={`/room/${roomId}`}>Back to room</Link>
      <Link className="button button-secondary" to={`/room/${roomId}`}>Pair your distraction device</Link>
      <Link className="button button-secondary" to={`${base}/shared`}>Shared focus screen</Link>
      <Link className="button button-secondary" to={base}>Group challenges</Link>
    </nav>
    {view === 'shared' ? <FocusPanel key={sessionId} roomId={roomId} sessionId={sessionId} onEnded={() => { refreshRoom(); setRevision(value => value + 1); }} />
      : <><p className="muted mb-6">Study here on your main device. Pair your distraction phone from the room overview, then keep it face-down with its tracking page open. The shared focus screen shows everyone’s phone state.</p><SessionChallenges key={sessionId} sessionId={sessionId} /></>}
  </>;
}
