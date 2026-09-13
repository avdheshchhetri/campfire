import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { callStudyAPI } from './api.js';
import { newTopicRows } from './utils.js';
import { analyzePDF } from './analyzePDF.js';
import { buttonClass, cardClass, ErrorMessage, Field, inputClass, secondaryClass } from './ui.jsx';

export default function SyllabusUpload({ roomId, onSaved = () => {} }) {
  return <SyllabusForm key={roomId} roomId={roomId} onSaved={onSaved} />;
}

function SyllabusForm({ roomId, onSaved }) {
  const [raw, setRaw] = useState('');
  const [mode, setMode] = useState('text');
  const [file, setFile] = useState(null);
  const fileInput = useRef(null);
  const [topics, setTopics] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function act(operation) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setMessage('');
    try { await operation(); } catch (err) { setMessage(''); setError(controller.current?.signal.aborted ? 'Analysis cancelled. No new topics were saved.' : err.message || 'Could not process the syllabus.'); }
    finally { controller.current = null; inFlight.current = false; setBusy(false); }
  }
  async function save() {
    const existing = await supabase.from('syllabus_topics').select('title,order_index').eq('room_id', roomId);
    if (existing.error) throw existing.error;
    const rows = newTopicRows(topics, existing.data, roomId);
    if (!rows.length) { setMessage('These topics are already in your room.'); return; }
    const result = await supabase.from('syllabus_topics').insert(rows);
    if (result.error) throw result.error;
    setMessage(`${rows.length} topics added. Existing progress was preserved.`);
    setTopics(null); setRaw(''); setFile(null);
    if (fileInput.current) fileInput.current.value = '';
    onSaved();
  }
  return <section className={cardClass}>
    <h2 className="font-serif text-2xl">Turn a syllabus into a study plan</h2>
    <p className="mt-2 text-sm leading-6 text-stone-500">Upload a syllabus or short chapter, or paste its text. Review and edit the AI’s suggested topics before adding them.</p>
    <div className="mt-5 flex gap-2" role="group" aria-label="Syllabus input type">{[['text', 'Paste text'], ['pdf', 'Upload PDF']].map(([value, label]) => <button key={value} type="button" className={`${secondaryClass} ${mode === value ? 'bg-emerald-100' : ''}`} aria-pressed={mode === value} disabled={busy} onClick={() => { setMode(value); setTopics(null); setError(''); setMessage(''); }}>{label}</button>)}</div>
    <form className="mt-5 grid gap-4" onSubmit={event => { event.preventDefault(); void act(async () => {
      setTopics(null);
      controller.current = new AbortController();
      const result = mode === 'pdf'
        ? await analyzePDF(file, roomId, setMessage, controller.current.signal)
        : await callStudyAPI('/api/parse-syllabus', { roomId, text: raw }, { signal: controller.current.signal });
      controller.current.signal.throwIfAborted();
      setTopics(result.topics); setMessage('Analysis complete. Review the topics before saving.');
    }); }}>
      {mode === 'text' ? <><Field label="Syllabus text"><textarea className={inputClass} rows={8} required maxLength={50000} value={raw} onChange={e => { setRaw(e.target.value); setTopics(null); }} disabled={busy} placeholder="Unit 1: Data structures — arrays, linked lists, stacks…" /></Field><p className="text-xs text-stone-500">{raw.length.toLocaleString()} / 50,000 characters</p></> :
        <div className="space-y-3 rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 p-5">
          <Field label="Syllabus or chapter PDF"><input ref={fileInput} className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-100 file:px-3 file:py-2 file:text-emerald-900`} type="file" accept=".pdf,application/pdf" required disabled={busy} onChange={e => { setFile(e.target.files?.[0] || null); setTopics(null); setError(''); setMessage(''); }} /></Field>
          <p className="text-xs leading-5 text-stone-600">Up to 200 MB and 1,000 pages. Large PDFs are automatically split into smaller batches. Each individual page must fit within 3 MB. Text and scanned PDFs are supported; scans must be readable. No password-protected files.</p>
          {file && <p className="break-all text-sm font-medium text-emerald-900">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
          <p className="text-xs leading-5 text-stone-500">Analysis sends PDF batches to Gemini through our server. Large books take longer and use multiple AI requests; a desktop browser is recommended. Only the topics you save are stored in Campfire.</p>
        </div>}
      <button className={buttonClass} disabled={busy || (mode === 'pdf' ? !file : !raw.trim())}>{busy ? 'Analyzing…' : mode === 'pdf' ? 'Analyze PDF' : 'Find syllabus topics'}</button>
    </form>
    {busy && controller.current && <button type="button" className={secondaryClass} onClick={() => controller.current?.abort()}>Cancel analysis</button>}
    {topics && <div className="mt-6 space-y-3"><h3 className="font-semibold">Review {topics.length} topics</h3><ol className="grid max-h-96 gap-3 overflow-y-auto pr-2">{topics.map((topic, index) => <li key={index} className="flex items-center gap-2"><span className="w-6 text-xs text-stone-400">{index + 1}</span><input aria-label={`Topic ${index + 1} title`} className={inputClass} maxLength={200} value={topic.title} disabled={busy} onChange={e => setTopics(items => items.map((item, i) => i === index ? { ...item, title: e.target.value } : item))} /><button type="button" className={secondaryClass} aria-label={`Remove topic ${index + 1}`} disabled={busy} onClick={() => setTopics(items => items.filter((_, i) => i !== index))}>×</button></li>)}</ol><button className={buttonClass} disabled={busy || !topics.length || topics.some(topic => !topic.title.trim())} onClick={() => void act(save)}>Add topics to room</button></div>}
    <div className="mt-4"><ErrorMessage>{error}</ErrorMessage><p role="status" className="text-sm text-emerald-800">{message}</p></div>
  </section>;
}
