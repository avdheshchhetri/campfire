import { useRef, useState } from 'react';
import { useHref } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { createDevicePair } from './deviceApi.js';

export default function PairDevicePanel() {
  const [pair, setPair] = useState(null);
  const [label, setLabel] = useState('My phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const href = useHref(`/pair${pair ? `?code=${encodeURIComponent(pair.pairing_code)}` : ''}`);
  const url = new URL(href, window.location.href).href;
  async function generate() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { setPair(await createDevicePair(label)); }
    catch (cause) { setError(cause.message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="panel p-5 space-y-4">
    <h2 className="text-xl">Your distraction device</h2>
    <p>Work here on your laptop. Pair your phone with this profile to track its face-down status.</p>
    <label>Phone label<input value={label} onChange={event => setLabel(event.target.value)} maxLength={60} disabled={busy} /></label>
    <button className="button" onClick={generate} disabled={busy}>{busy ? 'Creating pairing code…' : pair ? 'Generate another pairing code' : 'Add Distraction Device'}</button>
    {pair && <div className="space-y-3">
      <p>Pairing code: <strong>{pair.pairing_code}</strong></p>
      <QRCodeSVG value={url} size={176} marginSize={4} title={`Pair your phone with code ${pair.pairing_code}`} />
      <p>Scan this QR code on your phone, or open <a className="underline break-all" href={href}>{url}</a> there.</p>
      <p className="muted text-sm">This code can pair one phone within 15 minutes. The phone keeps your identity until its browser data is cleared. Keep the code within your group.</p>
    </div>}
    {error && <p className="error-banner" role="alert">{error}</p>}
  </section>;
}
