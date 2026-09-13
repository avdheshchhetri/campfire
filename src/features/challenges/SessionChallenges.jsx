import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { ChallengeEngine } from './ChallengeEngine';
import './challenges.css';

export default function SessionChallenges({ sessionId }) {
  const { room } = useOutletContext();
  const { user } = useAuth();
  const [topics, setTopics] = useState([]);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setJoined(false); setError('');
    Promise.all([
      supabase.from('syllabus_topics').select('id,title').eq('room_id', room.id).order('order_index'),
      supabase.from('session_presence').select('user_id').eq('session_id', sessionId).eq('user_id', user.id).maybeSingle(),
    ]).then(([syllabus, presence]) => {
      if (!current) return;
      if (syllabus.error || presence.error) throw syllabus.error || presence.error;
      setTopics(syllabus.data || []); setJoined(Boolean(presence.data));
    }).catch(cause => { if (current) setError(cause.message); });
    return () => { current = false; };
  }, [room.id, sessionId, user.id, revision]);
  async function join() {
    setBusy(true); setError('');
    try {
      const { error: cause } = await supabase.from('session_presence').upsert(
        { session_id: sessionId, user_id: user.id },
        { onConflict: 'session_id,user_id', ignoreDuplicates: true },
      );
      if (cause) throw cause;
      setJoined(true);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <div className="cf-session-challenges">
    {error && <p role="alert" className="error-banner">{error} <button onClick={() => setRevision(value => value + 1)}>Retry</button></p>}
    {!joined ? <section className="panel"><h2 className="font-display">Join the challenge circle</h2><p className="muted my-4">Each teammate joins on their own device. A round needs 3–6 participants.</p><button className="button" onClick={join} disabled={busy}>{busy ? 'Joining…' : 'Join session'}</button></section>
      : <ChallengeEngine client={supabase} roomId={room.id} sessionId={sessionId} userId={user.id} roomName={room.name} subject={room.subject || ''} topics={topics} />}
  </div>;
}
