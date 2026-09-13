import { useState } from 'react';
import CreateRoom from './CreateRoom.jsx';
import JoinRoom from './JoinRoom.jsx';
import Dashboard from './Dashboard.jsx';
import SyllabusUpload from './SyllabusUpload.jsx';
import TeachTopic from './TeachTopic.jsx';
import { secondaryClass } from './ui.jsx';

export default function SyllabusTracker({ initialRoomId = null }) {
  const [roomId, setRoomId] = useState(initialRoomId);
  const [screen, setScreen] = useState('dashboard');
  const [topicId, setTopicId] = useState('');
  function enter(room) { setRoomId(room.id); setScreen('dashboard'); }
  return <main className="min-h-screen bg-surface dark:bg-stone-50 px-4 py-8 text-primary dark:text-stone-800 sm:px-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4"><span className="text-xl font-bold tracking-tight text-success dark:text-emerald-900">campfire <span className="ml-2 text-sm font-normal text-muted dark:text-stone-500">Syllabus & teach-back</span></span>{roomId && <button className={secondaryClass} onClick={() => { setRoomId(null); setScreen('dashboard'); }}>Switch room</button>}</header>
      {!roomId ? <div className="grid gap-6 md:grid-cols-2"><CreateRoom onCreated={enter} /><JoinRoom onJoined={enter} /></div> : <>
        <nav className="flex flex-wrap gap-2" aria-label="Study room views">{[['dashboard', 'Dashboard'], ['syllabus', 'Add syllabus'], ['teach', 'Teach a topic']].map(([key, label]) => <button key={key} className={`${secondaryClass} ${screen === key ? 'bg-success-soft dark:bg-emerald-100' : ''}`} aria-current={screen === key ? 'page' : undefined} onClick={() => { setScreen(key); if (key === 'teach') setTopicId(''); }}>{label}</button>)}</nav>
        {screen === 'dashboard' && <Dashboard roomId={roomId} onTeach={id => { setTopicId(id); setScreen('teach'); }} onAddSyllabus={() => setScreen('syllabus')} />}
        {screen === 'syllabus' && <SyllabusUpload roomId={roomId} />}
        {screen === 'teach' && <TeachTopic roomId={roomId} initialTopicId={topicId} />}
      </>}
    </div>
  </main>;
}
