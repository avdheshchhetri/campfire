import { useRef, useState } from 'react';
import type { GeneratedChallengeInput } from './types';

type Props = {
  subject: string;
  topics: { id: string; title: string }[];
  busy: boolean;
  disabled?: boolean;
  onGenerate: (input: GeneratedChallengeInput) => Promise<void>;
};

export function StartChallenge({ subject, topics, busy, disabled, onGenerate }: Props) {
  const [topicId, setTopicId] = useState('');
  const lock = useRef(false);
  const selected = topics.find(topic => topic.id === topicId) || topics[0];
  async function generate() {
    if (lock.current || busy || disabled || !selected) return;
    lock.current = true;
    try { await onGenerate({ subject, topicTitle: selected.title }); }
    finally { lock.current = false; }
  }
  return <div className="cf-generator">
    <label htmlFor="cf-topic">Syllabus topic</label>
    <select id="cf-topic" value={selected?.id || ''} onChange={event => setTopicId(event.target.value)} disabled={busy || !topics.length}>
      {!topics.length && <option value="">Add a syllabus topic first</option>}
      {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
    </select>
    <button className="cf-primary" disabled={busy || disabled || !selected} onClick={() => void generate()}>
      {busy ? 'Preparing challenge…' : 'Generate with Gemini'}
    </button>
    <small>Different questions on this topic; maths uses the same format with different numbers. Your hint goes to someone else.</small>
    {!subject && <small>This room has no subject tag; the selected topic will guide the puzzle.</small>}
  </div>;
}
