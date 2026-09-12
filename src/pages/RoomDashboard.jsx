import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, Check, Copy, Flame, Puzzle, Trophy } from 'lucide-react';

export default function RoomDashboard() {
  const { room, activeSession } = useOutletContext();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  async function copyCode() {
    try { await navigator.clipboard.writeText(room.join_code); setCopied(true); setCopyError(''); }
    catch { setCopyError('Select and copy the code above to share it.'); }
  }
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-6"><div><p className="eyebrow">SETTLE IN, GET CURIOUS</p><h1 className="page-heading mt-3 break-words">{room.name}</h1><p className="muted mt-3">{room.subject || 'Your space to learn together.'}</p></div><Link className="button button-secondary" to={`/room/${room.id}/leaderboard`}><Trophy size={17} />View leaderboard<ArrowRight size={16} /></Link></header>
      <section className="invite-strip"><div><p className="eyebrow">BETTER WITH YOUR PEOPLE</p><h2 className="text-xl mt-2">Save them a seat.</h2><p className="muted text-sm mt-2">Share this code so your group can join.</p></div><div><div className="flex items-center gap-4"><code className="join-code">{room.join_code}</code><button onClick={copyCode} className="icon-button" aria-label="Copy room code">{copied ? <Check size={19} /> : <Copy size={19} />}</button></div>{copied && <p className="text-sm mt-2" role="status">Code copied</p>}{copyError && <p className="text-sm mt-2" role="status">{copyError}</p>}</div></section>
      {room.exam_date && <p className="flex items-center gap-2 text-sm muted"><CalendarDays size={17} />Exam day: {new Date(`${room.exam_date}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</p>}
      <div className="feature-grid">
        <section className="feature-card"><BookOpen className="text-[#426348]" size={27} strokeWidth={1.5} /><h2>Your syllabus</h2><p>Upload a syllabus PDF, build your shared learning map, and teach topics back to Gemini.</p><Link className="button mt-7" to={`/room/${room.id}/syllabus`}>Open syllabus<ArrowRight size={17} /></Link></section>
        <section className="feature-card campfire-card"><Flame className="text-[#b74724]" size={29} strokeWidth={1.5} /><span className="coming-soon">{activeSession ? 'Session available' : 'Coming soon'}</span><h2>The campfire</h2><p>Put your phones down and give your attention to the group.</p>{activeSession ? <Link className="button mt-7" to={`/room/${room.id}/session/${activeSession.id}`}>Open session<ArrowRight size={17} /></Link> : <div className="placeholder-note">Your focus sessions will gather here.</div>}</section>
        <section className="feature-card"><Puzzle className="text-[#7e6287]" size={27} strokeWidth={1.5} /><span className="coming-soon">Coming soon</span><h2>Shared challenges</h2><p>Trade clues, connect the dots, and find the answer together.</p><div className="placeholder-note">A little challenge is on its way.</div></section>
      </div>
    </div>
  );
}
