import { useEffect, useRef, useState } from 'react';
import { endSession, startSession, watchSession } from './campfireApi.js';
import Avatar from '../components/Avatar.jsx';

export function StartSessionButton({ roomId, onStarted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function start() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError('');
    try { onStarted(await startSession(roomId)); }
    catch (cause) { setError(cause.message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div>
    <button disabled={busy || !roomId} onClick={start}
      className="rounded-xl bg-orange-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50">
      {busy ? 'Starting…' : 'Start Session'}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
}

// participants is the COMPLETE session roster: [{ user_id, name, avatar_url }].
export default function SharedScreen(props) {
  if (!props.sessionId) return <p role="alert">A session ID is required.</p>;
  return <SessionDisplay key={props.sessionId} {...props} />;
}

function SessionDisplay({ sessionId, participants = [], canEnd = false, onEnded }) {
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState([]);
  const [online, setOnline] = useState(new Set());
  const [status, setStatus] = useState('connecting');
  const [syncError, setSyncError] = useState('');
  const [endError, setEndError] = useState('');
  const [ending, setEnding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(() => !document.hidden);
  const endLock = useRef(false);
  const clock = useRef({ total: 0, since: null });

  useEffect(() => watchSession(sessionId, {
    onSnapshot: (nextSession, nextRows) => { setSession(nextSession); setRows(nextRows); },
    onOnline: setOnline,
    onStatus: (nextStatus, message = '') => { setStatus(nextStatus); setSyncError(message); },
  }), [sessionId]);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);

  const byUser = new Map(rows.map(row => [row.user_id, row.state]));
  const roster = [...new Map(participants.map(person => [person.user_id, person])).values()];
  const blockers = roster.filter(person => !online.has(person.user_id) || byUser.get(person.user_id) !== 'down');
  const running = Boolean(session?.is_active && visible && status === 'ready'
    && !ending && roster.length > 0 && blockers.length === 0);

  useEffect(() => {
    if (!running) return;
    const current = clock.current;
    current.since = performance.now();
    const tick = setInterval(() => setElapsed(current.total + performance.now() - current.since), 100);
    return () => {
      clearInterval(tick);
      current.total += performance.now() - current.since;
      current.since = null;
      setElapsed(current.total);
    };
  }, [running]);

  async function finish() {
    if (endLock.current) return;
    endLock.current = true; setEnding(true); setEndError('');
    try {
      await endSession(sessionId);
      setSession(current => ({ ...current, is_active: false }));
      onEnded?.(sessionId);
    } catch (error) { setEndError(error.message); }
    finally { endLock.current = false; setEnding(false); }
  }
  const seconds = Math.floor(elapsed / 1000);
  const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
  const label = session?.is_active === false ? 'Session ended'
    : running ? 'Everyone is focused' : 'Timer paused';

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-12">
      <div className="mx-auto max-w-5xl space-y-8">
        <header><p className="font-semibold text-orange-300">CAMPFIRE MODE</p>
          <h1 className="mt-2 text-3xl font-bold">Group phone focus</h1></header>
        <section className={`rounded-3xl border p-8 text-center ${running ? 'border-emerald-500 bg-emerald-950' : 'border-orange-400 bg-slate-900'}`}>
          <p role="status" className="text-xl">{label}</p>
          <p className="my-5 font-mono text-5xl tabular-nums md:text-8xl" aria-label={`Focus time ${time}`}>{time}</p>
          {!roster.length && <p>Waiting for the session participant list.</p>}
          {blockers.length > 0 && <p>Waiting for phones: {blockers.map(person => person.name).join(', ')}</p>}
          {status !== 'ready' && <p>Sync: {status}. The timer waits for a confirmed connection.</p>}
        </section>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roster.map(person => {
            const connected = online.has(person.user_id);
            const focused = connected && byUser.get(person.user_id) === 'down';
            return <li key={person.user_id} className={`flex items-center gap-4 rounded-2xl border p-5 ${focused ? 'border-emerald-700 bg-emerald-950' : 'border-red-400 bg-red-950'}`}>
              <Avatar avatarUrl={person.avatar_url} name={person.name} className="grid h-12 w-12 place-items-center rounded-full bg-slate-700" />
              <div><p className={`font-bold ${focused ? 'text-emerald-300' : 'text-red-300'}`}>{person.name}</p>
                <p className="text-sm">{focused ? 'Phone down / focused' : !connected ? 'Phone offline / waiting' : 'Phone up / flagged'}</p></div>
            </li>;
          })}
        </ul>
        {(syncError || endError) && <p role="alert" className="text-red-300">{syncError || endError}</p>}
        {canEnd && <button onClick={finish} disabled={ending || !session?.is_active}
          className="rounded-xl bg-orange-400 px-6 py-3 font-bold text-slate-950 disabled:opacity-50">
          {ending ? 'Ending…' : 'End Session'}
        </button>}
      </div>
    </main>
  );
}
