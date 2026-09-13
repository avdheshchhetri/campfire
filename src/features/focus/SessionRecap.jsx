import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import ReadAloud from '../audio/ReadAloud.jsx';
import { buildSessionRecap } from './sessionRecap.js';

export default function SessionRecap({ roomId, session, examDate }) {
  const [recap, setRecap] = useState(null);
  useEffect(() => {
    let alive = true;
    setRecap(null);
    async function load() {
      try {
        const result = await supabase.from('syllabus_topics').select('title,status,last_taught_at').eq('room_id', roomId).order('order_index');
        if (result.error) throw result.error;
        if (alive) setRecap(buildSessionRecap(result.data, session, examDate));
      } catch { if (alive) setRecap({ mood: 'neutral', text: 'Your session is complete—return to the learning map to choose what to study next.' }); }
    }
    void load(); return () => { alive = false; };
  }, [roomId, session.id, session.ended_at, examDate]);
  return <section className="session-recap panel p-5 my-5" aria-label="Session recap">
    <h2 className="font-display text-xl">Your session recap</h2>
    <div className="mt-3 flex items-start gap-3"><p>{recap?.text || 'Session complete. Preparing your progress summary…'}</p>
      {recap && <ReadAloud roomId={roomId} text={recap.text} mood={recap.mood} label="Read session recap aloud" />}</div>
  </section>;
}
