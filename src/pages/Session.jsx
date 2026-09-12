import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Flame } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function Session() {
  const { roomId, sessionId } = useParams();
  const [state, setState] = useState({ loading: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ loading: true });
    supabase.from('sessions').select('*').eq('id', sessionId).eq('room_id', roomId).maybeSingle()
      .then(({ data, error }) => current && setState({ session: data, error: error?.message, loading: false }))
      .catch(error => current && setState({ error: error.message, loading: false }));
    return () => { current = false; };
  }, [roomId, sessionId, revision]);
  if (state.loading) return <p className="empty-state" role="status">Opening the session…</p>;
  return <section className="session-placeholder panel"><span className="large-flame"><Flame size={44} strokeWidth={1.4} /></span><p className="eyebrow mt-6">THE CAMPFIRE</p><h1 className="page-heading mt-3">{state.error ? 'Couldn’t load this session' : !state.session ? 'This session isn’t here' : state.session.is_active ? 'Your group’s focus space' : 'This session has ended'}</h1>{state.error ? <><p className="error-banner mt-5" role="alert">{state.error}</p><button className="button mt-5" onClick={() => setRevision(value => value + 1)}>Try again</button></> : <p className="muted mt-5 max-w-md mx-auto">{state.session ? 'The shared timer, phone-down activity, and group challenges are coming soon.' : 'Return to the room to find your group’s current session.'}</p>}<Link className="button button-secondary mt-8" to={`/room/${roomId}`}><ArrowLeft size={17} />Back to room</Link></section>;
}
