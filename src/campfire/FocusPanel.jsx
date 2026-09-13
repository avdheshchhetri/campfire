import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import SharedScreen from './SharedScreen.jsx';

export default function FocusPanel({ roomId, sessionId, onEnded }) {
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true, loading = false;
    async function refresh() {
      if (loading) return;
      loading = true;
      try {
        const { data, error } = await supabase.from('room_members')
          .select('user_id,profiles!room_members_user_id_fkey(display_name,avatar_url)').eq('room_id', roomId);
        if (error) throw error;
        if (current) {
          setParticipants(data.map(member => {
            const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
            return { user_id: member.user_id, name: profile?.display_name || 'Study partner', avatar_url: profile?.avatar_url };
          }));
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
    <section className="panel p-5 mb-5"><p>This panel shows your teammates’ phones. Keep using your laptop for syllabus, teach-back and challenges.</p>
      <p className="mt-3">Each room member pairs their phone using “Add Distraction Device” on the room overview. The timer advances only while every member’s phone is connected and face-down.</p>
      <p className="muted text-sm mt-2">Use the deployed HTTPS address on your phone. Keep its page open and screen unlocked. Focus time resets when this display reloads.</p>
    </section>
    {error && <p className="error-banner mb-4" role="alert">Couldn’t load the group: {error}</p>}
    <SharedScreen sessionId={sessionId} participants={participants} canEnd onEnded={onEnded} />
  </>;
}
