import { useCallback, useEffect, useRef, useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import { pairedClient, resolveDevice, writeDeviceState } from '../devices/deviceApi.js';
import { createStateWriter, orientationState } from './orientation.js';

// The laptop pairs this device first. This page must never create a second
// Supabase user or read the phone browser's unrelated saved login.
export default function PhonePresencePage({ sessionId, token, userId, displayName, avatarUrl, onSessionEnded }) {
  if (!sessionId || !token || !userId) return <p role="alert" className="p-6">Pair this phone from your laptop before joining a focus session.</p>;
  return <PhoneSession key={`${sessionId}:${userId}:${token}`} sessionId={sessionId} token={token}
    userId={userId} displayName={displayName} avatarUrl={avatarUrl} onSessionEnded={onSessionEnded} />;
}

function PhoneSession({ sessionId, token, userId, displayName, avatarUrl, onSessionEnded }) {
  const [active, setActive] = useState(true);
  const [connection, setConnection] = useState('connecting');
  const [connectionError, setConnectionError] = useState('');
  const [accessError, setAccessError] = useState('');
  const [writeError, setWriteError] = useState('');
  const [saved, setSaved] = useState(null);
  const [sensor, setSensor] = useState('up');
  const [simulate, setSimulate] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [hint, setHint] = useState('Enable the sensor, then put your phone face-down.');
  const [visible, setVisible] = useState(() => !document.hidden);
  const writer = useRef(null);
  const mounted = useRef(false);
  const activeRef = useRef(true);
  const sensorRef = useRef('up');
  const simulateRef = useRef(false);
  const visibleRef = useRef(!document.hidden);
  const effectiveRef = useRef('up');
  const onEndedRef = useRef(onSessionEnded);
  onEndedRef.current = onSessionEnded;
  const effective = visible && (simulate || sensor === 'down') ? 'down' : 'up';

  // Render sensor changes independently of network latency. Refs also capture
  // rapid down/up events before React commits its next render.
  const updatePhone = useCallback((changes = {}) => {
    if ('sensor' in changes) { sensorRef.current = changes.sensor; setSensor(changes.sensor); }
    if ('simulate' in changes) { simulateRef.current = changes.simulate; setSimulate(changes.simulate); }
    if ('visible' in changes) { visibleRef.current = changes.visible; setVisible(changes.visible); }
    const value = visibleRef.current && (simulateRef.current || sensorRef.current === 'down') ? 'down' : 'up';
    effectiveRef.current = value;
    if (changes.force) writer.current?.resync(value);
    else writer.current?.set(value);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let closed = false, ended = false, connected = false, checking = false;
    let tracking = false, trackAgain = false;
    const channel = pairedClient.channel(`campfire:${sessionId}`);
    let poll;

    function finish(message) {
      if (closed || ended) return;
      ended = true;
      activeRef.current = false;
      setActive(false);
      setAccessError(message);
      writer.current?.stop();
      clearInterval(poll);
      void channel.untrack();
      onEndedRef.current?.();
    }

    async function checkAccess() {
      if (closed || ended || checking) return;
      checking = true;
      try {
        const device = await resolveDevice(token);
        if (closed || ended) return;
        if (!device || device.user_id !== userId) {
          finish('This phone pairing is no longer available. Pair it again from your laptop.');
        } else if (!device.sessions?.some(session => session.id === sessionId)) {
          finish('This session has ended or you no longer have access to it.');
        } else {
          setAccessError('');
        }
      } catch (error) {
        if (!closed && !ended) {
          if (error.code === '28000' || error.code === 'INVALID_DEVICE' || error.code === 'DEVICE_REVOKED') {
            finish('This phone pairing is no longer available. Pair it again from your laptop.');
          } else {
            setAccessError(`Could not check this session. Check your connection; retrying automatically. ${error.message || ''}`);
          }
        }
      } finally { checking = false; }
    }

    const instance = createStateWriter(
      state => writeDeviceState(token, sessionId, state),
      (error, value) => {
        if (closed || ended) return;
        setWriteError(error ? `Phone state could not sync. ${error.message || 'Check your connection.'}` : '');
        if (!error) setSaved(value);
        else void checkAccess();
      },
    );
    writer.current = instance;
    instance.set(effectiveRef.current);

    // Serialize tracking: if a tab hides during track(), follow its completion
    // with untrack() so it cannot remain present after going into the background.
    async function syncLiveness() {
      trackAgain = true;
      if (tracking || closed || ended || !connected) return;
      tracking = true;
      try {
        while (trackAgain && !closed && !ended && connected) {
          trackAgain = false;
          const foreground = visibleRef.current;
          const result = foreground ? await channel.track({ user_id: userId }) : await channel.untrack();
          if (closed || ended) { void channel.untrack(); return; }
          if (!trackAgain) {
            if (result !== 'ok') {
              setConnection('disconnected');
              setConnectionError('Could not connect this phone to the shared screen. Reconnecting…');
            } else {
              setConnection(foreground ? 'ready' : 'paused');
              setConnectionError('');
            }
          }
        }
      } catch (error) {
        if (!closed && !ended) {
          setConnection('disconnected');
          setConnectionError(error.message || 'Could not connect this phone to the shared screen.');
        }
      } finally { tracking = false; }
    }

    channel.subscribe(status => {
      if (closed || ended) return;
      connected = status === 'SUBSCRIBED';
      if (connected) {
        setConnection('syncing');
        instance.resync(effectiveRef.current);
        void syncLiveness();
      } else {
        setConnection('disconnected');
        setConnectionError('Shared screen connection lost. Reconnecting…');
      }
    });

    const visibilityChanged = () => {
      if (closed || ended) return;
      updatePhone({ visible: !document.hidden, sensor: 'up', simulate: false, force: !document.hidden });
      void syncLiveness();
      if (!document.hidden) void checkAccess();
    };
    const pageHidden = () => {
      if (closed || ended) return;
      updatePhone({ visible: false, sensor: 'up', simulate: false });
      void syncLiveness();
    };
    const online = () => {
      if (closed || ended) return;
      instance.resync(effectiveRef.current);
      void checkAccess();
      void syncLiveness();
    };
    const offline = () => {
      if (!closed && !ended) {
        setConnection('disconnected');
        setConnectionError('This phone is offline. The shared screen will pause until it reconnects.');
      }
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('pagehide', pageHidden);
    window.addEventListener('pageshow', visibilityChanged);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    void checkAccess();
    // Only access/lifecycle reconciliation. Realtime supplies liveness; healthy
    // unchanged phone states are never rewritten on a fixed timer.
    poll = setInterval(() => { void checkAccess(); }, 5000);

    return () => {
      closed = true;
      clearInterval(poll);
      instance.stop();
      if (writer.current === instance) writer.current = null;
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('pagehide', pageHidden);
      window.removeEventListener('pageshow', visibilityChanged);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      void channel.untrack();
      void pairedClient.removeChannel(channel);
    };
  }, [sessionId, token, userId, updatePhone]);

  useEffect(() => {
    if (!enabled || !active) return;
    let received = false;
    const orient = event => {
      if (!visibleRef.current || document.hidden) return;
      if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
      if (!received) {
        received = true;
        setHint('Motion detection enabled. Keep this page open and the screen unlocked.');
      }
      updatePhone({ sensor: orientationState(event.beta, event.gamma, sensorRef.current) });
    };
    window.addEventListener('deviceorientation', orient);
    const timeout = setTimeout(() => {
      if (!received) setHint('No sensor data received. Use Simulate Face-Down below.');
    }, 4000);
    return () => { clearTimeout(timeout); window.removeEventListener('deviceorientation', orient); };
  }, [enabled, active, updatePhone]);

  async function enableMotion() {
    setRequesting(true);
    try {
      if (!window.isSecureContext) throw new Error('Motion detection needs HTTPS. Use the simulator for now.');
      const api = window.DeviceOrientationEvent;
      if (!api) throw new Error('This browser has no orientation API. Use the simulator below.');
      // iOS requires permission to be requested directly from this tap handler.
      if (typeof api.requestPermission === 'function') {
        const permission = await api.requestPermission();
        if (permission !== 'granted') throw new Error('Motion permission denied. Use the simulator or change browser permissions.');
      }
      if (mounted.current && activeRef.current) { setEnabled(true); setHint('Waiting for sensor data…'); }
    } catch (error) {
      if (mounted.current) setHint(error.message);
    } finally { if (mounted.current) setRequesting(false); }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
      <section className="mx-auto max-w-md space-y-6 rounded-3xl border border-slate-700 p-6">
        <p className="text-sm font-semibold text-orange-300">CAMPFIRE MODE</p>
        <div className="flex items-center gap-3">
          <Avatar avatarUrl={avatarUrl} name={displayName} className="h-10 w-10 rounded-full" />
          <p className="text-slate-300">Paired as {displayName || 'Study partner'}</p>
        </div>
        <h1 className="text-3xl font-bold">Phones down. Focus together.</h1>
        <p role="status" className="text-slate-300">
          {!active ? 'This session has ended or this phone needs to be paired again.' : hint}
        </p>
        <div className={`rounded-2xl p-5 text-xl font-semibold ${effective === 'down' && active ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'}`}>
          {effective === 'down' && active ? 'Face-down / focused' : 'Face-up / paused'}
          {simulate && active && <span className="block text-sm">Simulation override enabled</span>}
        </div>
        <button onClick={enableMotion} disabled={requesting || enabled || !active}
          className="w-full rounded-xl bg-orange-400 p-3 font-bold text-slate-950 disabled:opacity-50">
          {requesting ? 'Requesting permission…' : enabled ? 'Motion Detection Enabled' : 'Enable Motion Detection'}
        </button>
        <button onClick={() => updatePhone({ simulate: !simulateRef.current })} aria-pressed={simulate} disabled={!active}
          className="w-full rounded-xl border border-slate-500 p-3 disabled:opacity-50">
          {simulate ? 'Stop Simulating Face-Down' : 'Simulate Face-Down'}
        </button>
        <p className="text-sm text-slate-400" aria-live="polite">
          Connection: {connection}. {saved === effective ? `Saved: ${saved}.` : 'State waiting to sync…'}
        </p>
        {(accessError || connectionError || writeError) && <p role="alert" className="text-red-300">{accessError || connectionError || writeError}</p>}
      </section>
    </main>
  );
}
