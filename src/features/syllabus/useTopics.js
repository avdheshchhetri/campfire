import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient.js';

export function useTopics(roomId) {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const result = await supabase.from('syllabus_topics').select('*')
        .eq('room_id', roomId).order('order_index', { ascending: true, nullsFirst: false }).order('id');
      if (current !== sequence.current) return;
      if (result.error) setError(result.error.message);
      else { setTopics(result.data); setError(''); }
    } catch (err) {
      if (current === sequence.current) setError(err.message || 'Could not load topics.');
    } finally { if (current === sequence.current) setLoading(false); }
  }, [roomId]);
  useEffect(() => {
    setTopics([]); setLoading(true); void refresh();
    const channel = supabase.channel(`syllabus:${roomId}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'syllabus_topics', filter: `room_id=eq.${roomId}` }, () => void refresh())
      .subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    const timer = setInterval(() => void refresh(), 10000);
    return () => { sequence.current++; clearInterval(timer); void supabase.removeChannel(channel); };
  }, [roomId, refresh]);
  return { topics, loading, error, refresh };
}
