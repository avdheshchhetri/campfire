import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { currentUserId, watchSession, writeState } from './campfireApi.js';
import { createStateWriter, orientationState } from './orientation.js';
import { useWakeLock } from './useWakeLock.js';

export default function PhonePresencePage({ sessionId }) {
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false, generation = 0;
    async function check() {
      const revision = ++generation;
      try {
        const id = await currentUserId();
        if (!disposed && revision === generation) { setUserId(id); setError(''); }
      } catch (cause) {
        if (!disposed && revision === generation) { setUserId(null); setError(cause.message); }
      }
    }
    void check();
    const { data } = supabase.auth.onAuthStateChange(() => {
      // Defer Auth calls outside the auth-event callback.
      queueMicrotask(() => { if (!disposed) void check(); });
    });
    return () => { disposed = true; data.subscription.unsubscribe(); };
  }, []);
  if (!sessionId) return <p role="alert">A session ID is required.</p>;
  if (!userId) return <p role="status" className="p-6">{error || 'Checking sign-in…'}</p>;
  return <PhoneSession key={`${sessionId}:${userId}`} sessionId={sessionId} userId={userId} />;
}

function PhoneSession({ sessionId, userId }) {
  const [active, setActive] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [connectionError, setConnectionError] = useState('');
  const [writeError, setWriteError] = useState('');
  const [saved, setSaved] = useState(null);
  const [sensor, setSensor] = useState('up');
  const [simulate, setSimulate] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [hint, setHint] = useState('Enable the sensor, then put your phone face-down.');
  const [visible, setVisible] = useState(() => !document.hidden);
  const wakeLock = useWakeLock(active === true);
  const writer = useRef(null);
  const mounted = useRef(false);
  const effective = visible && (simulate || sensor === 'down') ? 'down' : 'up';

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => watchSession(sessionId, {
    userId,
    onSnapshot: session => setActive(session.is_active),
    onOnline: () => {},
    onStatus: (status, message = '') => { setConnection(status); setConnectionError(message); },
  }), [sessionId, userId]);

  useEffect(() => {
    const instance = createStateWriter(
      state => writeState(sessionId, userId, state),
      (error, value) => {
        setWriteError(error ? error.message : '');
        if (!error) setSaved(value);
      },
    );
    writer.current = instance;
    return () => { instance.stop(); writer.current = null; };
  }, [sessionId, userId]);

  useEffect(() => {
    if (active === true) writer.current?.set(effective);
    // Stop queued writes when an ended session is observed.
    if (active === false) writer.current?.stop();
  }, [active, effective]);

  useEffect(() => {
    const change = () => { setVisible(!document.hidden); setSensor('up'); };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let received = false;
    const orient = event => {
      if (document.hidden) return;
      if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
      received = true;
      setHint('Motion detection enabled. Keep this page open and the screen unlocked.');
      setSensor(previous => orientationState(event.beta, event.gamma, previous));
    };
    window.addEventListener('deviceorientation', orient);
    const timeout = setTimeout(() => {
      if (!received) setHint('No sensor data received. Use Simulate Face-Down below.');
    }, 4000);
    return () => { clearTimeout(timeout); window.removeEventListener('deviceorientation', orient); };
  }, [enabled]);

  async function enableMotion() {
    setRequesting(true);
    try {
      if (!window.isSecureContext) throw new Error('Motion detection needs HTTPS. Use the simulator for now.');
      const api = window.DeviceOrientationEvent;
      if (!api) throw new Error('This browser has no orientation API. Use the simulator below.');
      // Called directly from the tap handler, before any other awaited work.
      if (typeof api.requestPermission === 'function') {
        const permission = await api.requestPermission();
        if (permission !== 'granted') throw new Error('Motion permission denied. Use the simulator or change browser permissions.');
      }
      if (mounted.current) { setEnabled(true); setHint('Waiting for sensor data…'); }
    } catch (error) {
      if (mounted.current) setHint(error.message);
    } finally { if (mounted.current) setRequesting(false); }
  }

  return (
    <main className="min-h-screen bg-page dark:bg-slate-950 px-5 py-10 text-primary dark:text-slate-100">
      <section className="mx-auto max-w-md space-y-6 rounded-3xl border border-border dark:border-slate-700 p-6">
        <p className="text-sm font-semibold text-accent dark:text-orange-300">CAMPFIRE MODE</p>
        <h1 className="font-display text-3xl font-bold">Phones down. Focus together.</h1>
        <p role="status" className="text-muted dark:text-slate-300">
          {active === false ? 'This session has ended.' : hint}
        </p>
        <div className={`rounded-2xl p-5 text-xl font-semibold ${effective === 'down' ? 'bg-success-soft dark:bg-emerald-950 text-success dark:text-emerald-300' : 'bg-danger-soft dark:bg-red-950 text-danger dark:text-red-300'}`}>
          {effective === 'down' ? 'Face-down / focused' : 'Face-up / paused'}
          {simulate && <span className="block text-sm">Simulation override enabled</span>}
        </div>
        <button onClick={enableMotion} disabled={requesting || enabled || active === false}
          className="w-full rounded-xl bg-accent dark:bg-orange-400 p-3 font-bold text-on-accent dark:text-slate-950 disabled:opacity-50">
          {requesting ? 'Requesting permission…' : enabled ? 'Motion Detection Enabled' : 'Enable Motion Detection'}
        </button>
        <button onClick={() => setSimulate(value => !value)} aria-pressed={simulate} disabled={active === false}
          className="w-full rounded-xl border border-border dark:border-slate-500 p-3 disabled:opacity-50">
          {simulate ? 'Stop Simulating Face-Down' : 'Simulate Face-Down'}
        </button>
        {active === true && <div className="text-sm text-muted dark:text-slate-300" role="status">
          <p>{wakeLock.status === 'active'
            ? 'Keep-awake is on. Leave this page open and place your phone face-down; automatic screen sleep is prevented.'
            : 'Keep-awake is unavailable or paused. Keep this page visible and turn off auto-lock in your phone settings for this session.'}</p>
          <p>Manually locking your phone or switching apps can suspend motion detection and pause shared focus. Return here to reconnect.</p>
          {wakeLock.status !== 'active' && wakeLock.status !== 'unsupported' && <button
            onClick={wakeLock.retry} className="mt-2 underline">Retry keep-awake</button>}
        </div>}
        <p className="text-sm text-muted dark:text-slate-400" aria-live="polite">
          Connection: {connection}. {saved === effective ? `Saved: ${saved}.` : 'State waiting to sync…'}
        </p>
        {(connectionError || writeError) && <p role="alert" className="text-danger dark:text-red-300">{connectionError || writeError}</p>}
      </section>
    </main>
  );
}
