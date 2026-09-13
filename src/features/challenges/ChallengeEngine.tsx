import Avatar from '../auth/Avatar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, CircleHelp, Flame, LockKeyhole, Radio, RotateCcw, Sparkles, Users, X } from 'lucide-react';
import type { ChallengeAdapter, ChallengeEngineProps, Snapshot } from './types';
import { createSupabaseAdapter } from './supabaseAdapter';
import { StartChallenge } from './StartChallenge';

export function ChallengeEngine(props: ChallengeEngineProps) {
  const adapter = useMemo(() => createSupabaseAdapter(props), [props.client, props.roomId, props.sessionId]);
  return <ChallengePanel key={`${props.roomId}:${props.sessionId}:${props.userId}`} adapter={adapter} userId={props.userId} roomName={props.roomName} subject={props.subject} topics={props.topics} />;
}

export function ChallengePanel({ adapter, userId, roomName = 'Physics study circle', demo = false, subject = '', topics = [] }: { adapter: ChallengeAdapter; userId: string; roomName?: string; demo?: boolean; subject?: string; topics?: { id: string; title: string }[] }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ challenge: null, clues: [], players: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const actionLock = useRef(false);
  const [feedback, setFeedback] = useState('');
  const [answer, setAnswer] = useState('');
  const [hidden, setHidden] = useState(false);
  const [help, setHelp] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try { const value = await adapter.load(); if (mounted.current && request === generation.current) { setSnapshot(value); setLoadError(''); } }
    catch (err) { if (mounted.current && request === generation.current) setLoadError(err instanceof Error ? err.message : 'Unable to load challenge.'); }
    finally { if (mounted.current) setLoading(false); }
  }, [adapter]);
  useEffect(() => { mounted.current = true; void refresh(); const stop = adapter.subscribe(() => void refresh(), setConnected); return () => { mounted.current = false; generation.current++; stop(); }; }, [adapter, refresh]);
  useEffect(() => { setHidden(false); setFeedback(''); setAnswer(''); void refresh(); }, [userId, refresh]);
  useEffect(() => { setFeedback(''); setAnswer(''); setHidden(false); }, [snapshot.challenge?.id]);
  async function act(fn: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError('');
    try { await fn(); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Try again.'); }
    finally { actionLock.current = false; setBusy(false); }
  }
  const { challenge, clues, players } = snapshot;
  const active = challenge?.status === 'active';
  const solved = challenge?.status === 'solved';
  const individual = challenge?.individual === true;
  const ownSolved = challenge?.own_solved === true;
  const inRound = players.some(player => player.user_id === userId);
  return <div className="cf-shell">
    <aside className="cf-sidebar"><a className="cf-brand" href="#"><Flame fill="currentColor" size={27}/> campfire<span>®</span></a><div className="cf-side-label">YOUR WORKSPACE</div><div className="cf-room"><span className="cf-room-icon">P</span><div>{roomName}<small>Learn better, together</small></div></div><div className="cf-side-label mt-10">IN THIS SESSION</div><div className="cf-nav-item"><Sparkles size={18}/> Challenge circle <span>01</span></div><div className="cf-side-bottom"><div className="cf-mini-flame"><Flame size={23}/></div><p>A little focus.<br/>A lot of possibility.</p><small>Good things happen in a circle.</small></div></aside>
    <div className="cf-workspace"><header className="cf-topbar"><span>{roomName} <span className="mx-3 opacity-30">/</span> <strong>Challenge circle</strong></span><span className="cf-connection"><i className={connected ? 'online' : ''}/>{demo ? 'Local demo' : connected ? 'Live session' : 'Polling · reconnecting'}</span></header>
    <main className="cf-main"><div className="cf-eyebrow"><span/> BETTER TOGETHER</div><div className="cf-heading"><div><h1 className="font-display">Many minds. One answer.</h1><p>You have a piece of the puzzle. Your circle has the rest.</p></div><button className="cf-help" onClick={() => setHelp(!help)} aria-expanded={help}><CircleHelp size={17}/> How it works</button></div>
      {help && <div className="cf-notice">Join an active study session with 1–6 members. Start a round, read your private clues, and explain them out loud. Gemini gives everyone different questions on the same topic; maths uses the same format with different numbers. Your hint goes to another named teammate. Submit your own answer; practice rounds use a shared answer. Any assigned teammate can submit or end the round.</div>}
      {(error || loadError) && <div role="alert" className="cf-error">{error || loadError}<button onClick={() => void refresh()}>Retry</button></div>}
      <div className="cf-grid"><section className="cf-stage"><div className="cf-stage-top"><span className="cf-badge"><Flame size={14}/> COLLABORATIVE CHALLENGE</span><span className="cf-round">{solved ? 'ROUND COMPLETE' : active ? 'ROUND IN PROGRESS' : 'A MOMENT TO CONNECT'}</span></div>
        <div className="cf-stage-copy"><h2 className="font-display">{solved ? 'That’s collective brilliance.' : challenge?.status === 'cancelled' ? 'A fresh spark awaits.' : 'The answer is between you.'}</h2><p>{solved ? 'Different clues. Shared understanding. You solved it together.' : individual ? 'Different questions, one topic. Solve your question and share the named hint with its owner.' : 'No one has the whole picture. Talk it through, connect your clues, and find the answer as a team.'}</p></div>
        <div className={`cf-circle ${solved ? 'is-solved' : ''}`} aria-label={`${players.length} teammates in the circle`}><div className="cf-orbit orbit-two"/><div className="cf-orbit orbit-one"/><div className="cf-center">{solved ? <Check size={38}/> : <Flame size={43} fill="currentColor"/>}</div>{players.map((player, i) => { const angle = (i / players.length) * Math.PI * 2 - Math.PI / 2; return <div className="cf-person" key={player.user_id} style={{ left: `${50 + 37 * Math.cos(angle)}%`, top: `${50 + 36 * Math.sin(angle)}%` }}><Avatar className={`cf-avatar tone-${i % 6}`} name={player.display_name} avatarKey={player.avatar_key} /><span>{player.user_id === userId ? 'You' : player.display_name}</span><small>{active ? 'Has a puzzle piece' : solved ? 'Solved together' : 'In the circle'}</small></div>; })}</div>
        <div className="cf-stage-footer"><Users size={16}/>{players.length} minds in the circle<span>·</span>{active ? 'Speak freely. Solve together.' : 'Everyone brings something.'}</div></section>
      <section className="cf-clue-panel"><div className="cf-section-label"><LockKeyhole size={16}/> YOUR PIECE<span>PRIVATE</span></div>
        {loading ? <div className="cf-empty" role="status">Gathering your circle…</div> : !challenge || challenge.status === 'cancelled' ? <div className="cf-empty"><div className="cf-paper-icon"><Sparkles size={30}/></div><h3 className="font-display">A puzzle worth sharing.</h3><p>Start a round to receive your private clues. Everyone gets different information—and every piece matters.</p><button className="cf-primary" disabled={busy || players.length < 1 || players.length > 6} onClick={() => void act(() => adapter.start())}>{busy ? 'Starting…' : demo ? 'Start a challenge' : 'Use a practice puzzle'}<ArrowRight size={18}/></button><small>{players.length === 1 ? "Solo round: you receive every clue." : "1–6 teammates · One shared answer"}</small>{adapter.startGenerated && <StartChallenge subject={subject} topics={topics} busy={busy} disabled={players.length < 1 || players.length > 6} onGenerate={input => act(() => adapter.startGenerated!(input))} />}</div> : <><div className="cf-clue-title"><h3 className="font-display">{challenge.title}</h3><span>01</span></div><p className="cf-prompt">{individual && <strong>Your question: </strong>}{challenge.prompt}</p>{individual && <p role="status">{challenge.solved_count ?? 0} of {players.length} questions solved.{ownSolved ? " Yours is correct—help your teammates finish." : " Ask the teammate holding your hint for help."}</p>}{inRound ? <><div className="cf-clue-card"><div className="cf-clue-card-heading"><span>FOR YOUR EYES ONLY</span><LockKeyhole size={14}/></div>{hidden ? <p className="cf-hidden">Your clues are tucked away.</p> : clues.map((clue, i) => <div key={clue.id}><small>CLUE {i + 1}</small><p>{clue.clue_text}</p></div>)}<div className="cf-note">Read the named hint to that teammate.<br/>{individual ? 'Help them solve their own question.' : 'You are all solving the same question.'}</div></div><button className="cf-text-button" onClick={() => setHidden(!hidden)}>{hidden ? 'Show my clues' : 'Hide my clues'}</button></> : <div className="cf-notice">This round started before you joined. You can participate in the next round.</div>}<div className="cf-listening"><Radio size={18}/><p><strong>Listen for the missing pieces.</strong><br/>Your teammates hold hints for you—ask them to share.</p></div></>}
      </section></div>
      <section className="cf-answer"><div className="cf-answer-intro"><span className="cf-answer-icon">{solved ? <Check size={23}/> : <Sparkles size={23}/>}</span><div><h3 className="font-display">{solved ? 'A shared win.' : 'Put your heads together.'}</h3><p>{solved ? `Solved in ${challenge?.attempts} ${challenge?.attempts === 1 ? 'attempt' : 'attempts'}. Take a moment to explain why it works.` : individual ? 'Submit the answer to your own question.' : 'Found the connection? Submit your group’s answer.'}</p></div></div>{solved ? <button className="cf-primary" disabled={busy} onClick={() => void act(() => adapter.start())}>Another round <RotateCcw size={16}/></button> : <form onSubmit={event => { event.preventDefault(); if (!active || !inRound || ownSolved || !answer.trim() || busy) return; void act(async () => { const correct = await adapter.submit(answer.trim()); setFeedback(correct ? (individual ? 'Your answer is correct. Help your teammates with their hints!' : 'You connected all the pieces!') : 'Not quite. Compare your clues and check your reasoning together.'); }); }}><label className="sr-only" htmlFor="cf-answer">{individual ? "Your answer" : "Group answer"}</label><input id="cf-answer" value={answer} onChange={event => setAnswer(event.target.value)} placeholder={ownSolved ? "Your question is solved" : individual ? "Your answer…" : "Your collective aha moment…"} maxLength={160} disabled={!active || !inRound || ownSolved || busy}/><button className="cf-primary" disabled={!active || !inRound || ownSolved || busy || !answer.trim()}>{busy ? 'Checking…' : 'Submit answer'}<ArrowRight size={17}/></button></form>}</section>
      {solved && adapter.startGenerated && <StartChallenge subject={subject} topics={topics} busy={busy} disabled={players.length < 1 || players.length > 6} onGenerate={input => act(() => adapter.startGenerated!(input))} />}
      <div role="status" className="cf-feedback">{feedback || (!active && !solved ? "Start a round above to unlock the answer field." : active && !inRound ? "You can answer in the next round after joining." : "")}</div><footer className="cf-footer"><span><LockKeyhole size={13}/> {demo ? 'Demo clues are simulated. Live clues are private to each teammate.' : 'Your clues stay yours. The discovery belongs to everyone.'}</span>{active && inRound && <button onClick={() => setConfirmCancel(true)}>End this round</button>}</footer>
      {confirmCancel && <div className="cf-modal-backdrop"><div className="cf-modal" role="dialog" aria-modal="true" aria-labelledby="cf-end-title"><button className="cf-modal-close" aria-label="Close" onClick={() => setConfirmCancel(false)}><X size={20}/></button><h3 id="cf-end-title" className="font-display">End the round for everyone?</h3><p>Your group can start a fresh challenge afterward.</p><button className="cf-primary" autoFocus disabled={busy} onClick={() => { setConfirmCancel(false); void act(() => adapter.cancel()); }}>End round</button><button className="cf-text-button" onClick={() => setConfirmCancel(false)}>Keep solving</button></div></div>}
    </main></div></div>;
}
