import { useRef, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { requireUser } from './api.js';
import { buttonClass, cardClass, ErrorMessage, Field, inputClass } from './ui.jsx';

export default function JoinRoom({ onJoined = () => {} }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState(null);
  const inFlight = useRef(false);
  async function submit(event) {
    event.preventDefault(); if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const joinCode = code.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(joinCode)) throw new Error('Enter a six-character room code.');
      const user = await requireUser();
      const room = await supabase.from('rooms').select('*').eq('join_code', joinCode).maybeSingle();
      if (room.error) throw room.error;
      if (!room.data) throw new Error('No accessible room matches that code. Check it with your group.');
      const result = await supabase.from('room_members').insert({ room_id: room.data.id, user_id: user.id });
      if (result.error && result.error.code !== '23505') throw result.error;
      setJoined(room.data); onJoined(room.data);
    } catch (err) { setError(err.message || 'Could not join this room.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className={cardClass}>
    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Find your people</p>
    <h2 className="mt-2 font-serif text-2xl">Join a room</h2>
    {joined ? <p className="mt-5 text-emerald-800" role="status">You’re in {joined.name}.</p> :
      <form className="mt-5 grid gap-4" onSubmit={submit}>
        <p className="text-sm leading-6 text-stone-500">Ask a teammate for their six-character room code.</p>
        <Field label="Room code"><input className={`${inputClass} font-mono uppercase tracking-widest`} autoComplete="off" spellCheck={false} required maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABC234" disabled={busy} /></Field>
        <ErrorMessage>{error}</ErrorMessage>
        <button className={buttonClass} disabled={busy || code.trim().length !== 6}>{busy ? 'Joining…' : 'Join room'}</button>
      </form>}
  </section>;
}
