import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Pause, Volume2 } from 'lucide-react';
import { requestSpeech } from './speechApi.js';

export default function ReadAloud({ roomId, text, mood = 'neutral', label = 'Read aloud' }) {
  return <Playback key={`${roomId}:${mood}:${text}`} roomId={roomId} text={text} mood={mood} label={label} />;
}
function Playback({ roomId, text, mood, label }) {
  const audio = useRef(null), controller = useRef(null), busy = useRef(false);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const element = audio.current;
    return () => { controller.current?.abort(); if (element && !element.paused) element.pause(); };
  }, []);
  async function toggle() {
    if (busy.current) return;
    const element = audio.current;
    if (!element.paused) { element.pause(); return; }
    busy.current = true; setMessage('');
    const request = new AbortController(); controller.current = request;
    try {
      if (!element.getAttribute('src')) {
        setStatus('loading');
        const source = await requestSpeech({ roomId, text, mood, signal: request.signal });
        if (request.signal.aborted) return;
        element.src = source;
      }
      if (element.ended) element.currentTime = 0;
      try { await element.play(); }
      catch { if (!request.signal.aborted) { setStatus('paused'); setMessage('Audio is ready. Tap play to listen.'); } }
    } catch (error) {
      if (!request.signal.aborted) { setStatus('error'); setMessage(error.message || 'Audio unavailable; keep reading the text.'); }
    } finally { busy.current = false; }
  }
  return <span className="read-aloud">
    <button type="button" className="read-aloud-button" aria-label={status === 'speaking' ? `Pause ${label.toLowerCase()}` : label}
      title={label} disabled={status === 'loading' || !text?.trim()} onClick={() => void toggle()}>
      {status === 'loading' ? <LoaderCircle size={18} className="animate-spin" /> : status === 'speaking' ? <Pause size={18} /> : <Volume2 size={18} />}
    </button>
    <audio ref={audio} preload="none" onPlay={() => {
      // Keep simultaneous tutor clips from talking over one another.
      document.querySelectorAll('audio[data-tutor-audio]').forEach(other => { if (other !== audio.current) other.pause(); });
      setStatus('speaking');
    }} data-tutor-audio onPause={() => setStatus('paused')} onEnded={() => setStatus('idle')}
      onError={() => { audio.current?.removeAttribute('src'); setStatus('error'); setMessage('Audio could not play. Read the text or retry.'); }} />
    <span className="read-aloud-status" role="status">{status === 'loading' ? 'Preparing audio…' : status === 'speaking' ? 'Speaking…' : message}</span>
  </span>;
}
