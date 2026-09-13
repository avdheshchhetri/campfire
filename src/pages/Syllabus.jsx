import { useAuth } from '../features/auth/AuthContext';
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Dashboard, SyllabusUpload, TeachTopic } from '../features/syllabus/index.js';

export default function Syllabus() {
  const { user } = useAuth();
  const { room } = useOutletContext();
  const [screen, setScreen] = useState('dashboard');
  const [topicId, setTopicId] = useState('');
  return <div className="space-y-6">
    <nav aria-label="Syllabus views" className="flex flex-wrap gap-3">
      {['dashboard', 'upload', 'teach'].map(value => <button key={value}
        className={`button ${screen === value ? '' : 'button-secondary'}`}
        aria-current={screen === value ? 'page' : undefined}
        onClick={() => { setScreen(value); if (value === 'teach') setTopicId(''); }}>
        {{ dashboard: 'Learning map', upload: 'Add syllabus', teach: 'Teach a topic' }[value]}
      </button>)}
    </nav>
    {screen === 'dashboard' && <Dashboard roomId={room.id} onAddSyllabus={() => setScreen('upload')} onTeach={id => { setTopicId(id); setScreen('teach'); }} />}
    {screen === 'upload' && <SyllabusUpload roomId={room.id} />}
    {screen === 'teach' && <TeachTopic userId={user?.id} roomId={room.id} initialTopicId={topicId} />}
  </div>;
}
