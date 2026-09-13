import ReadAloud from '../audio/ReadAloud.jsx';
import { presentChallenge } from './challengePresentation';
import Avatar from '../auth/Avatar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ChallengeAdapter, ChallengeEngineProps, Snapshot } from './types';
import { createSupabaseAdapter } from './supabaseAdapter';
import { StartChallenge } from './StartChallenge';


export function ChallengeEngine(props: ChallengeEngineProps) {
  const adapter = useMemo(() => createSupabaseAdapter(props), [props.client, props.roomId, props.sessionId]);
  return <ChallengePanel key={`${props.roomId}:${props.sessionId}:${props.userId}`} adapter={adapter} roomId={props.roomId} userId={props.userId} roomName={props.roomName} subject={props.subject} topics={props.topics} />;
}

export function ChallengePanel({ adapter, userId, roomId, roomName = 'Physics study circle', demo = false, subject = '', topics = [] }: { adapter: ChallengeAdapter; userId: string; roomId?: string; roomName?: string; demo?: boolean; subject?: string; topics?: { id: string; title: string }[] }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ challenge: null, clues: [], players: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const actionLock = useRef(false);
  const [feedback, setFeedback] = useState('');
  const [answer, setAnswer] = useState('');
  const generation = useRef(0);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try { const value = await adapter.load(); if (mounted.current && request === generation.current) { setSnapshot(presentChallenge(value)); setLoadError(''); } }
    catch (err) { if (mounted.current && request === generation.current) setLoadError(err instanceof Error ? err.message : 'Unable to load challenge.'); }
    finally { if (mounted.current) setLoading(false); }
  }, [adapter]);
  useEffect(() => { mounted.current = true; void refresh(); const stop = adapter.subscribe(() => void refresh(), setConnected); return () => { mounted.current = false; generation.current++; stop(); }; }, [adapter, refresh]);
  useEffect(() => { setFeedback(''); setAnswer(''); void refresh(); }, [userId, refresh]);
  useEffect(() => { setFeedback(''); setAnswer(''); }, [snapshot.challenge?.id]);
  async function act(fn: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError('');
    try { await fn(); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Try again.'); }
    finally { actionLock.current = false; setBusy(false); }
  }
  const { challenge, players } = snapshot;
  const active = challenge?.status === 'active';
  const solved = challenge?.status === 'solved';
  const ownSolved = challenge?.own_solved === true;
  const inRound = players.some(player => player.user_id === userId);
  const current = challenge?.shared_question === true;
  const canStart = !current || !active;
  return <div className="cf-shell cf-session-refresh"><div className="cf-workspace">
    <section className="cf-main" aria-label="Session practice">
      <header className="cf-heading"><div><h2 className="font-display">Syllabus practice</h2></div><span className="cf-connection"><i className={connected ? 'online' : ''}/>{connected ? 'Live session' : 'Syncing session'}</span></header>
      {(error || loadError) && <div role="alert" className="cf-error">{error || loadError}<button onClick={() => void refresh()}>Retry</button></div>}
      <div className="cf-study-layout"><section className="cf-study-question">
        {loading ? <p role="status">Loading your session…</p> : current && challenge?.status !== 'cancelled' ? <>
          <div className="cf-section-label">{challenge.title}</div>
          <div className="cf-question-heading"><h2 className="font-display">Question</h2>{roomId && <ReadAloud roomId={roomId} text={challenge.prompt} label="Read quiz question aloud" />}</div>
          <p className="cf-question-text">{challenge.prompt}</p>
          <p className="cf-study-status" role="status">{challenge.solved_count ?? 0} of {players.length} answered correctly{solved ? ' · Round complete' : ''}</p>
          {active && inRound && <form className="cf-study-form" onSubmit={event => { event.preventDefault(); if (ownSolved || !answer.trim() || busy) return; void act(async () => { const correct = await adapter.submit(answer.trim()); setFeedback(correct ? 'Correct. Your answer is saved; everyone must finish before the next question.' : 'Not quite. Read the question again and try another answer.'); }); }}>
            <label htmlFor="cf-answer">Your answer</label><input id="cf-answer" value={answer} onChange={event => setAnswer(event.target.value)} maxLength={160} placeholder="Enter your answer" disabled={ownSolved || busy}/>
            <button className="cf-primary" disabled={ownSolved || busy || !answer.trim()}>{ownSolved ? 'Answer saved' : busy ? 'Checking…' : 'Submit answer'}<ArrowRight size={16}/></button>
          </form>}
          {ownSolved && !solved && <p role="status">You’re done. Discuss the question while the others finish.</p>}
          {!inRound && <p>You joined after this round started. You can answer in the next round.</p>}
          {feedback && <div role="status" className="cf-feedback">{feedback}</div>}
        </> : <div className="cf-study-welcome"><p>Choose a topic. Everyone gets the same question and answers separately.</p>{challenge && <p>Starting a new question replaces the previous round.</p>}</div>}
        {!loading && canStart && adapter.startGenerated && <StartChallenge subject={subject} topics={topics} busy={busy} disabled={players.length < 1 || players.length > 6 || !inRound} onGenerate={input => act(() => adapter.startGenerated!(input))} />}
        {!loading && canStart && !adapter.startGenerated && <p>Open a study room with syllabus topics to generate a practice question.</p>}
      </section></div>
      <footer className="cf-study-roster" aria-label="Session participants"><span className="cf-roster-count">{players.length}/6 participants</span><ul>{players.map(player => <li key={player.user_id}><Avatar className="cf-roster-avatar" name={player.display_name} avatarKey={player.avatar_key}/><span>{player.display_name}{player.user_id === userId ? ' (you)' : ''}</span></li>)}</ul><details className="cf-study-rules"><summary>Session rules</summary><p>Everyone answers separately. The next question unlocks when all participants answer correctly. Tap the speaker to listen; audio is optional.</p></details></footer>
    </section></div></div>;
}
