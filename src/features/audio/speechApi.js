import { supabase } from '../../lib/supabaseClient.js';

export async function requestSpeech({ roomId, text, mood, signal }) {
  if (import.meta.env.VITE_GITHUB_PAGES === 'true') throw new Error('Read-aloud needs API hosting; text remains available on GitHub Pages.');
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(25000)]);
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new Error('Audio took too long. Read the text or retry.'));
    if (bounded.aborted) onAbort();
    else bounded.addEventListener('abort', onAbort, { once: true });
  });
  const work = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (bounded.aborted) throw new Error('Audio request cancelled.');
    if (error || !data.session) throw new Error('Sign in to use read-aloud.');
    const response = await fetch('/api/speak', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ roomId, text, mood }), signal: bounded,
    });
    let result;
    try { result = await response.json(); } catch { throw new Error('Audio is unavailable. The text is still available.'); }
    if (!response.ok) throw new Error(result.error || 'Audio is unavailable. Please retry.');
    if (result.mimeType !== 'audio/mpeg' || typeof result.audio !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.audio)) throw new Error('Audio could not be loaded.');
    return `data:audio/mpeg;base64,${result.audio}`;
  };
  try { return await Promise.race([work(), aborted]); }
  finally { bounded.removeEventListener('abort', onAbort); }
}
