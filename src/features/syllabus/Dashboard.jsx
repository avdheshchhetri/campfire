import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { daysUntilExam } from './utils.js';
import { useTopics } from './useTopics.js';
import { cardClass, ErrorMessage, secondaryClass } from './ui.jsx';

const statuses = {
  untouched: { label: 'Untouched', color: 'border-border dark:border-red-200 bg-danger-soft dark:bg-red-50 text-danger dark:text-red-900', dot: 'bg-danger dark:bg-red-500' },
  taught: { label: 'Taught · needs verification', color: 'border-border dark:border-amber-200 bg-warning-soft dark:bg-amber-50 text-warning dark:text-amber-900', dot: 'bg-warning dark:bg-amber-500' },
  verified: { label: 'Verified', color: 'border-border dark:border-emerald-200 bg-success-soft dark:bg-emerald-50 text-success dark:text-emerald-900', dot: 'bg-success dark:bg-emerald-500' },
};

export default function Dashboard({ roomId, onTeach = () => {}, onAddSyllabus = () => {} }) {
  return <RoomDashboard key={roomId} roomId={roomId} onTeach={onTeach} onAddSyllabus={onAddSyllabus} />;
}

function RoomDashboard({ roomId, onTeach, onAddSyllabus }) {
  const { topics, loading, error, refresh } = useTopics(roomId);
  const [room, setRoom] = useState(null);
  const [roomError, setRoomError] = useState('');
  const [today, setToday] = useState(new Date());
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    async function loadRoom() {
      try {
        const result = await supabase.from('rooms').select('id,name,subject,exam_date,join_code').eq('id', roomId).single();
        if (alive) { setRoom(result.data); setRoomError(result.error?.message || ''); setToday(new Date()); }
      } catch (err) { if (alive) setRoomError(err.message || 'Could not load this room.'); }
    }
    void loadRoom(); const timer = setInterval(() => void loadRoom(), 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [roomId, reload]);
  const remaining = topics.filter(topic => topic.status !== 'verified');
  const verified = topics.length - remaining.length;
  const days = daysUntilExam(room?.exam_date, today);
  const examSoon = days !== null && days >= 0 && days <= 7;
  return <section className="space-y-5">
    <header className={cardClass}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-accent dark:text-emerald-700">{room?.subject || 'Your study circle'}</p><h1 className="font-display mt-2 font-semibold text-3xl">{room?.name || 'Room dashboard'}</h1><p className="mt-2 text-sm text-muted dark:text-stone-500">{verified} of {topics.length} topics verified · {topics.filter(topic => topic.status === 'taught').length} awaiting follow-up{room?.exam_date ? ` · Exam: ${room.exam_date}` : ''}</p></div><div className="text-right"><p className="text-xs text-muted dark:text-stone-500">Invite your group</p><p className="mt-1 font-mono text-xl tracking-widest text-accent dark:text-emerald-800">{room?.join_code || '…'}</p></div></div><progress aria-label="Verified topics" className="mt-5 h-2 w-full accent-accent dark:accent-emerald-700" max={Math.max(topics.length, 1)} value={verified} /></header>
    <ErrorMessage>{error || roomError}</ErrorMessage>
    {(error || roomError) && <button className={secondaryClass} onClick={() => { void refresh(); setReload(value => value + 1); }}>Retry loading</button>}
    {examSoon && <aside data-exam-notice role="status" className="rounded-2xl border border-border dark:border-amber-300 bg-warning-soft dark:bg-amber-50 p-5 text-warning dark:text-amber-950"><h2 className="font-display font-semibold">{days === 0 ? 'Your exam is today' : `Your exam is in ${days} ${days === 1 ? 'day' : 'days'}`}</h2>{remaining.length ? <><p className="mt-2 text-sm">These topics still need verification:</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{remaining.map(topic => <li key={topic.id}>{topic.title}</li>)}</ul></> : <p className="mt-2 text-sm">Every topic is verified. Make time for a final review.</p>}</aside>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display font-semibold text-2xl">Your learning map</h2><button className={secondaryClass} onClick={onAddSyllabus}>Add syllabus topics</button></div>
    {loading ? <p role="status">Loading your study plan…</p> : !topics.length ? <div className={`${cardClass} text-center`}><h3 className="font-display font-semibold text-xl">Start with the big picture.</h3><p className="mt-2 text-sm text-muted dark:text-stone-500">Paste your syllabus to give this room a shared learning map.</p></div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{topics.map((topic, index) => {
      const style = statuses[topic.status] || statuses.untouched;
      return <article key={topic.id} data-topic-status={topic.status} className={`learning-topic flex flex-col rounded-2xl border p-5 ${style.color}`}><span className="text-xs opacity-60">TOPIC {String(index + 1).padStart(2, '0')}</span><h3 className="font-display mt-3 font-semibold text-xl">{topic.title}</h3><p className="mt-4 flex items-center gap-2 text-xs"><span className={`h-2 w-2 rounded-full ${style.dot}`} />{style.label}</p><button className="mt-5 self-start rounded-lg border border-current/20 px-3 py-2 text-sm disabled:opacity-60" disabled={topic.status === 'verified'} onClick={() => onTeach(topic.id)}>{topic.status === 'verified' ? 'Completed' : topic.status === 'taught' ? 'Teach again' : 'Teach this topic'}</button></article>;
    })}</div>}
  </section>;
}
