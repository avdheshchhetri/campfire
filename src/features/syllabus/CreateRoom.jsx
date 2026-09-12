import { useRef, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { requireUser } from './api.js';
import { makeJoinCode } from './utils.js';
import { buttonClass, cardClass, ErrorMessage, Field, inputClass } from './ui.jsx';

export default function CreateRoom({ onCreated = () => {} }) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('CS');
  const [examDate, setExamDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const pendingRoom = useRef(null);
  const inFlight = useRef(false);

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const user = await requireUser();
      if (!name.trim() || !subject.trim()) throw new Error('Enter a room name and subject.');
      if (pendingRoom.current && pendingRoom.current.created_by !== user.id) throw new Error('Sign back in as the room creator to finish setup.');
      if (!pendingRoom.current) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const result = await supabase.from('rooms').insert({
            name: name.trim(), subject: subject.trim(), exam_date: examDate || null,
            created_by: user.id, join_code: makeJoinCode(),
          }).select('*').single();
          if (!result.error) { pendingRoom.current = result.data; break; }
          if (result.error.code !== '23505') throw result.error;
        }
        if (!pendingRoom.current) throw new Error('Could not reserve a room code. Please retry.');
      }
      const room = pendingRoom.current;
      const membership = await supabase.from('room_members').insert({ room_id: room.id, user_id: user.id });
      if (membership.error && membership.error.code !== '23505') {
        throw new Error(`Room ${room.join_code} was created, but membership could not be saved. Retry to finish this same room. ${membership.error.message}`);
      }
      setCreated(room); pendingRoom.current = null; onCreated(room);
    } catch (err) { setError(err.message || 'Could not create the room.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <section className={cardClass}>
    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Start a study circle</p>
    <h2 className="mt-2 font-serif text-2xl">Create a room</h2>
    {created ? <div className="mt-5 space-y-3" role="status"><p>{created.name} is ready. Share this code:</p><p className="font-mono text-3xl tracking-widest text-emerald-800">{created.join_code}</p></div> :
      <form onSubmit={submit} className="mt-5 grid gap-4">
        <Field label="Room name"><input className={inputClass} required maxLength={100} value={name} onChange={e => setName(e.target.value)} disabled={busy || !!pendingRoom.current} placeholder="Tuesday study circle" /></Field>
        <Field label="Subject"><input className={inputClass} list="cf-subject-options" required maxLength={100} value={subject} onChange={e => setSubject(e.target.value)} disabled={busy || !!pendingRoom.current} /><datalist id="cf-subject-options">{['CS', 'ECE', 'Medicine', 'ME', 'Other'].map(value => <option key={value} value={value} />)}</datalist></Field>
        <Field label="Exam date (optional)"><input type="date" className={inputClass} value={examDate} onChange={e => setExamDate(e.target.value)} disabled={busy || !!pendingRoom.current} /></Field>
        <ErrorMessage>{error}</ErrorMessage>
        <button className={buttonClass} disabled={busy}>{busy ? 'Creating your room…' : pendingRoom.current ? 'Finish joining created room' : 'Create room'}</button>
      </form>}
  </section>;
}
