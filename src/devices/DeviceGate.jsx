import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { chooseMainDevice, claimDevicePair, forgetDevice, readDeviceChoice, resolveDevice } from './deviceApi.js';

// Orientation code is loaded only after a secondary token has been resolved.
const SecondaryDevice = lazy(() => import('./SecondaryDevice.jsx'));

export default function DeviceGate({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [choice, setChoice] = useState(() => {
    try { return readDeviceChoice(); }
    catch { return { error: 'Browser storage is unavailable. Allow site storage, then reload to keep your device identity.' }; }
  });
  const [resolution, setResolution] = useState({});
  const [revision, setRevision] = useState(0);
  const dedicated = location.pathname === '/pair' || location.pathname.startsWith('/secondary')
    || /^\/room\/[^/]+\/session\/[^/]+\/phone\/?$/.test(location.pathname);

  useEffect(() => {
    if (!choice.token) return;
    let current = true;
    const token = choice.token;
    setResolution({ token, loading: true });
    resolveDevice(choice.token).then(device => {
      if (!device?.user_id) throw new Error('This phone pairing could not be found.');
      if (current) setResolution({ token, device });
    }).catch(error => { if (current) setResolution({ token, error: error.message }); });
    return () => { current = false; };
  }, [choice.token, revision]);

  const pairingInvalid = useCallback(error => {
    setResolution({ token: choice.token, error: error.message || 'This phone pairing is no longer available. Pair it again from your main device.' });
  }, [choice.token]);

  useEffect(() => {
    const changed = () => {
      try { setChoice(readDeviceChoice()); }
      catch { setChoice({ error: 'Browser storage is unavailable. Allow site storage and reload.' }); }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  if (choice.error) return <section className="panel p-6"><p role="alert">{choice.error}</p></section>;
  if (choice.token) {
    // A storage event can replace the token before its lookup effect runs. Never
    // render the previous profile together with a newly selected phone token.
    const currentResolution = resolution.token === choice.token ? resolution : {};
    if (currentResolution.device) return <Suspense fallback={<p role="status">Opening your phone…</p>}>
      <SecondaryDevice key={choice.token} token={choice.token} initialDevice={currentResolution.device}
        onPairingInvalid={pairingInvalid} />
    </Suspense>;
    return <section className="panel p-6">
      <p role={currentResolution.error ? 'alert' : 'status'}>{currentResolution.error || 'Checking your phone pairing…'}</p>
      {currentResolution.error && <><button className="button mt-4" onClick={() => setRevision(value => value + 1)}>Retry pairing lookup</button>
        <button className="button button-secondary mt-4" onClick={() => {
          try { forgetDevice(); setChoice({}); navigate('/pair', { replace: true }); }
          catch { setChoice({ error: 'Allow browser storage, then reload.' }); }
        }}>Use another pairing code</button></>}
    </section>;
  }
  if (choice.main && !dedicated) return children;
  return <PairingEntry key={location.search} initialCode={new URLSearchParams(location.search).get('code') || ''}
    onPaired={token => { setChoice({ token }); navigate('/secondary', { replace: true }); }}
    onMain={() => {
      chooseMainDevice(); setChoice({ main: true });
      if (dedicated) navigate('/', { replace: true });
    }} />;
}

export function PairingEntry({ initialCode = '', onPaired, onMain }) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { const { token } = await claimDevicePair(code); onPaired(token); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <main className="main-content"><section className="panel mx-auto max-w-md p-6 space-y-5">
    <h1 className="page-heading">Add your distraction device</h1>
    <p>On your laptop, choose “Add Distraction Device.” Enter its code here to use the same profile on your phone.</p>
    <form onSubmit={submit} className="space-y-5">
      <label htmlFor="pairing-code">Enter pairing code</label>
      <input id="pairing-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6}
        value={code} onChange={event => setCode(event.target.value.toUpperCase())} disabled={busy} required />
      <button className="button" disabled={busy || code.trim().length !== 6}>{busy ? 'Pairing…' : 'Pair this phone'}</button>
    </form>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <button className="button button-secondary" disabled={busy} onClick={() => {
      try { onMain(); } catch (cause) { setError(cause.message); }
    }}>Skip, this is my own main device</button>
    <p className="muted text-sm">Your laptop keeps the study tools. Only your paired phone detects face-down focus.</p>
  </section></main>;
}
