import { useRef, useState } from 'react';
import { callStudyAPI } from './api.js';
import { useTopics } from './useTopics.js';
import { buttonClass, cardClass, ErrorMessage, Field, inputClass, secondaryClass } from './ui.jsx';

export default function TeachTopic({ roomId, initialTopicId = '', onUpdated = () => {} }) {
  return <TeachForm key={`${roomId}:${initialTopicId}`} roomId={roomId} initialTopicId={initialTopicId} onUpdated={onUpdated} />;
}

function TeachForm({ roomId, initialTopicId, onUpdated }) {
  const { topics, loading, error: loadError, refresh } = useTopics(roomId);
  const [topicId, setTopicId] = useState(initialTopicId);
  const [explanation, setExplanation] = useState('');
  const [followup, setFollowup] = useState(null);
  const [answer, setAnswer] = useState('');
  const [verdict, setVerdict] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const selected = topics.find(topic => topic.id === topicId);
  function reset() { setFollowup(null); setAnswer(''); setVerdict(null); setError(''); }
  async function submit(event) {
    event.preventDefault(); if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      if (followup) {
        const result = await callStudyAPI('/api/verify-teaching', { roomId, topicId, stage: 'evaluate', answer, attempt: followup.attempt });
        setVerdict(result); setFollowup(null);
      } else {
        const result = await callStudyAPI('/api/verify-teaching', { roomId, topicId, stage: 'question', explanation });
        setFollowup(result); setVerdict(null);
      }
      await refresh(); onUpdated();
    } catch (err) {
      setError(err.message || 'Could not check your explanation.');
      if ([409, 410].includes(err.status)) { setFollowup(null); setAnswer(''); await refresh(); }
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <section className={cardClass}>
    <p className="text-xs font-semibold uppercase tracking-widest text-success dark:text-emerald-700">Understanding, in your own words</p>
    <h2 className="font-display mt-2 font-semibold text-2xl">Teach a topic</h2>
    <p className="mt-2 text-sm leading-6 text-muted dark:text-stone-500">Explain it as you would to a teammate. The AI asks one follow-up before marking the topic verified.</p>
    <div className="mt-4"><ErrorMessage>{loadError}</ErrorMessage></div>
    {loading ? <p role="status" className="mt-4">Loading your topics…</p> : topics.length === 0 ? <p className="mt-4 text-sm">Add your syllabus before teaching a topic.</p> :
      <form onSubmit={submit} className="mt-5 grid gap-4">
        <Field label="Topic"><select className={inputClass} required value={topicId} disabled={busy || !!followup} onChange={e => { setTopicId(e.target.value); reset(); setExplanation(''); }}><option value="">Choose a topic</option>{topics.map(topic => <option key={topic.id} value={topic.id}>{topic.title} — {topic.status}</option>)}</select></Field>
        <Field label="Your explanation"><textarea className={inputClass} rows={7} required maxLength={10000} value={explanation} disabled={busy || !!followup || selected?.status === 'verified' || !!verdict} onChange={e => setExplanation(e.target.value)} placeholder="The key idea is… For example…" /></Field>
        {followup && <div className="space-y-4 rounded-xl border border-border dark:border-amber-200 bg-warning-soft dark:bg-amber-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-warning dark:text-amber-800">Taught · One more connection</p><p className="font-sans font-semibold text-xl text-primary dark:text-stone-800">{followup.question}</p><Field label="Your follow-up answer"><textarea autoFocus className={inputClass} rows={4} required maxLength={10000} value={answer} onChange={e => setAnswer(e.target.value)} disabled={busy} /></Field><p className="text-xs text-muted dark:text-stone-500">Answer within 30 minutes. Reloading this page starts a new attempt.</p></div>}
        <ErrorMessage>{error}</ErrorMessage>
        {verdict && <div role="status" className={`rounded-xl border p-4 ${verdict.verified ? 'border-border dark:border-emerald-200 bg-success-soft dark:bg-emerald-50 text-success dark:text-emerald-900' : 'border-border dark:border-amber-200 bg-warning-soft dark:bg-amber-50 text-warning dark:text-amber-900'}`}><h3 className="font-display font-semibold">{verdict.verified ? 'Understanding verified' : 'Keep building your explanation'}</h3><p className="mt-2 text-sm leading-6">{verdict.feedback}</p></div>}
        {selected?.status === 'verified' ? <p className="text-sm text-success dark:text-emerald-800">Your group has verified this topic. Pick another to continue.</p> : verdict ? <button type="button" className={buttonClass} onClick={reset}>Revise and try again</button> : <button className={buttonClass} disabled={busy || !selected || !explanation.trim() || (!!followup && !answer.trim())}>{busy ? 'Thinking with you…' : followup ? 'Check my understanding' : 'Ask my follow-up'}</button>}
        {followup && <button type="button" className={secondaryClass} disabled={busy} onClick={reset}>Start a new explanation</button>}
      </form>}
  </section>;
}
