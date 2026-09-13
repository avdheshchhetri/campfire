import { useEffect, useState } from 'react';
import PhonePresencePage from '../campfire/PhonePresencePage.jsx';
import Avatar from '../components/Avatar.jsx';
import { resolveDevice } from './deviceApi.js';

export default function SecondaryDevice({ token, initialDevice, onPairingInvalid }) {
  const [device, setDevice] = useState(initialDevice);
  const [selected, setSelected] = useState(initialDevice.sessions?.[0]?.id || '');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const sessions = device.sessions || [];
  const sessionId = sessions.some(session => session.id === selected) ? selected : sessions[0]?.id;

  useEffect(() => {
    let current = true, busy = false;
    async function refresh() {
      if (busy) return;
      busy = true;
      try {
        const next = await resolveDevice(token);
        if (!next?.user_id) throw Object.assign(new Error('Your phone pairing is unavailable. Pair it again from your main device.'), { code: '28000' });
        if (current) {
          setDevice(next);
          // Remember the first session that arrives after waiting. A later
          // session in another room must not silently move a focused phone.
          setSelected(previous => next.sessions?.some(session => session.id === previous) ? previous : next.sessions?.[0]?.id || '');
          setError('');
        }
      } catch (cause) {
        if (current) {
          setError(cause.message);
          if (cause.code === '28000') {
            setDevice(previous => ({ ...previous, sessions: [] }));
            onPairingInvalid?.(cause);
          }
        }
      } finally { busy = false; }
    }
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { current = false; clearInterval(timer); };
  }, [token, revision, onPairingInvalid]);

  return <>
    <section className="panel p-5 space-y-3">
      <p><Avatar avatarUrl={device.avatar_url} name={device.display_name} className="avatar small" /> {device.display_name}’s distraction device</p>
      <p className="muted">Keep studying on your main device. Leave this phone page open and the screen unlocked.</p>
      {sessions.length > 0 && <label>Focus session
        <select value={sessionId} onChange={event => setSelected(event.target.value)}>
          {sessions.map(session => <option key={session.id} value={session.id}>{session.room_name} — {new Date(session.started_at).toLocaleTimeString()}</option>)}
        </select>
      </label>}
      {error && <p role="alert" className="error-banner">{error}</p>}
      {!sessionId && <p role="status">Waiting for a session. Start one in your room on your laptop; this phone will find it automatically.</p>}
    </section>
    {sessionId && <PhonePresencePage key={`${device.user_id}:${sessionId}`} sessionId={sessionId} token={token}
      userId={device.user_id} displayName={device.display_name} avatarUrl={device.avatar_url}
      onSessionEnded={() => setRevision(value => value + 1)} />}
  </>;
}
