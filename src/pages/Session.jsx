import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import SessionChallenges from '../features/challenges/SessionChallenges.jsx';
import PhonePresencePage from '../campfire/PhonePresencePage.jsx';
import SharedScreen from '../campfire/SharedScreen.jsx';

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
      <Link className="button button-secondary" to={`${base}/phone`}>Use this phone</Link>
      <Link className="button button-secondary" to={`${base}/shared`}>Shared focus screen</Link>
      <Link className="button button-secondary" to={base}>Group challenges</Link>
    </nav>
    {view === 'phone' ? <PhonePresencePage key={sessionId} sessionId={sessionId} />
      : view === 'shared' ? <FocusDisplay key={sessionId} roomId={roomId} sessionId={sessionId} phonePath={`${base}/phone`} onEnded={() => { refreshRoom(); setRevision(value => value + 1); }} />
      : <><p className="muted mb-6">For phone-free focus, each teammate opens “Use this phone.” Keep “Shared focus screen” open on a separate laptop or tablet.</p><SessionChallenges key={sessionId} sessionId={sessionId} /></>}
  </>;
}

function FocusDisplay({ roomId, sessionId, phonePath, onEnded }) {
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    let loading = false;
    async function refresh() {
      if (loading) return;
      loading = true;
      try {
        const { data, error } = await supabase.from('room_members')
          .select('user_id,profiles!room_members_user_id_fkey(display_name)').eq('room_id', roomId);
        if (error) throw error;
        if (current) {
          setParticipants(data.map(member => ({ user_id: member.user_id,
            name: (Array.isArray(member.profiles) ? member.profiles[0] : member.profiles)?.display_name || 'Study partner', avatar_url: null })));
          setError('');
        }
      } catch (cause) {
        if (current) { setParticipants([]); setError(cause.message); }
      } finally { loading = false; }
    }
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { current = false; clearInterval(timer); };
  }, [roomId]);
  return <>
    <section className="panel p-5 mb-5"><p>Everyone in this room is included in the focus timer. Each member must open the phone page, sign in and enable detection.</p>
      <p className="mt-3 break-all">Phone page: <a className="underline" href={phonePath}>{window.location.origin}{phonePath}</a></p>
      <p className="muted text-sm mt-2">On a real phone, use the deployed HTTPS address. This localhost link opens only on this computer. Focus time resets when this display reloads.</p>
    </section>
    {error && <p className="error-banner mb-4" role="alert">Couldn’t load the group: {error}</p>}
    <SharedScreen sessionId={sessionId} participants={participants} canEnd onEnded={onEnded} />
  </>;
}
