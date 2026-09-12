import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, DoorOpen, Flame, Plus, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { createRoom, joinRoom, listMyRooms } from '../lib/rooms';
import SignIn from '../components/SignIn';

export default function Landing() {
  const { profile, user } = useAuth();
  const [mode, setMode] = useState('create');
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || !profile) return;
    let current = true;
    setLoading(true); setListError('');
    listMyRooms(user.id).then(data => current && setRooms(data))
      .catch(err => current && setListError(err.message))
      .finally(() => current && setLoading(false));
    return () => { current = false; };
  }, [user?.id, profile, revision]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const roomId = mode === 'create'
        ? await createRoom({ name: form.get('name'), subject: form.get('subject'), examDate: form.get('examDate') })
        : await joinRoom(form.get('code'));
      navigate(`/room/${roomId}`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="landing">
      <section className="welcome-copy">
        <div className="eyebrow flex items-center gap-2"><span className="tiny-line" />YOUR PLACE TO COME TOGETHER</div>
        <h1>Good company.<br />Better <em>focus.</em></h1>
        <p className="welcome-description">Pull up a chair. Bring your questions.<br className="hidden sm:block" /> Make a little progress, together.</p>
        <div className="principles"><span><BookOpen size={17} />One shared syllabus</span><span><Flame size={17} />A space to focus</span><span><Users size={17} />Your kind of people</span></div>
        <div className="quote-note"><span className="quote-mark">“</span><p>You don’t have to figure<br />everything out alone.</p><span className="quote-line" /></div>
      </section>

      <section className="entry-panel panel">
        <div className="entry-heading"><span className="soft-icon"><Flame size={23} /></span><span className="eyebrow">MAKE YOURSELF AT HOME</span></div>
        {!profile ? <><h2>There’s a seat for you.</h2><p className="muted mb-7">Start with your name. Your group is next.</p><SignIn /></> : <>
          <h2>Find your study circle.</h2><p className="muted mb-6">Start something new, or pick up where your friends are.</p>
          <div className="segmented" role="group" aria-label="Room action">
            <button type="button" aria-pressed={mode === 'create'} onClick={() => { setMode('create'); setError(''); }}><Plus size={16} />Create a room</button>
            <button type="button" aria-pressed={mode === 'join'} onClick={() => { setMode('join'); setError(''); }}><DoorOpen size={16} />Join a room</button>
          </div>
          <form key={mode} onSubmit={submit} className="space-y-5 mt-6">
            {mode === 'create' ? <>
              <div><label htmlFor="room-name">Room name</label><input id="room-name" name="name" placeholder="e.g. The midnight study club" required maxLength={100} disabled={busy} /></div>
              <div><label htmlFor="subject">What are you studying? <span className="optional">Optional</span></label><input id="subject" name="subject" placeholder="e.g. Biology" maxLength={100} disabled={busy} /></div>
              <div><label htmlFor="exam-date">Exam date <span className="optional">Optional</span></label><input type="date" id="exam-date" name="examDate" disabled={busy} /></div>
            </> : <div><label htmlFor="join-code">Room code</label><input id="join-code" name="code" placeholder="Enter your group’s code" autoComplete="off" spellCheck="false" className="uppercase tracking-wider" required maxLength={64} disabled={busy} /><p className="muted text-sm mt-2">Ask someone in your group for the room code.</p></div>}
            {error && <p role="alert" className="error-banner">{error}</p>}
            <button className="button w-full justify-center" disabled={busy}>{busy ? 'Opening your room…' : mode === 'create' ? 'Create your room' : 'Join your group'}<ArrowRight size={17} /></button>
          </form>
        </>}
      </section>

      {profile && <section className="your-rooms">
        <div className="flex items-end justify-between mb-5"><div><p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2 className="text-2xl mt-2">Your rooms</h2></div><span className="muted text-sm">{rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}</span></div>
        {loading ? <p role="status" className="muted">Finding your rooms…</p> : listError ? <div role="alert" className="error-banner">{listError}<button className="button button-secondary mt-3" onClick={() => setRevision(value => value + 1)}>Try again</button></div> : rooms.length ? <div className="room-grid">{rooms.map(room => <Link className="room-card" key={room.id} to={`/room/${room.id}`}><span className="soft-icon"><BookOpen size={20} /></span><div className="min-w-0"><h3 className="font-semibold break-words">{room.name}</h3><p className="muted text-sm mt-1">{room.subject || 'A little bit of everything'}</p></div><ArrowRight className="ml-auto shrink-0" size={18} /></Link>)}</div> : <div className="room-empty"><Users size={24} /><div><p>Your next good study session starts here.</p><p className="muted text-sm mt-1">Create or join a room to bring your circle together.</p></div></div>}
      </section>}
    </div>
  );
}
