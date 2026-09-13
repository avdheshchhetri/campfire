import { useState } from 'react';

type Topic = { id: string; title: string };
function shuffle<T,>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function StudyMinigames({ topics }: { topics: Topic[] }) {
  const [game, setGame] = useState<'memory' | 'scramble' | null>(null);
  const usable = topics.filter(topic => topic.title.trim());
  return <section className="cf-minigames" aria-label="Study minigames"><div className="cf-mini-heading"><h2 className="font-display">Study break</h2><span>Optional · Personal scores · No AI needed</span></div>
    <div className="cf-mini-actions"><button className="cf-primary" aria-pressed={game === 'memory'} disabled={usable.length < 2} onClick={() => setGame(game === 'memory' ? null : 'memory')}>Topic pairs</button><button className="cf-primary" aria-pressed={game === 'scramble'} disabled={!usable.length} onClick={() => setGame(game === 'scramble' ? null : 'scramble')}>Topic scramble</button></div>
    {!usable.length && <p>Add syllabus topics to unlock these games.</p>}
    {usable.length === 1 && <p>Add one more topic to unlock Topic pairs.</p>}
    {game === 'memory' && <Memory key={usable.map(t => t.id).join(',')} topics={usable}/>}
    {game === 'scramble' && <Scramble key={usable.map(t => t.id).join(',')} topics={usable}/>}
  </section>;
}
function Memory({topics}:{topics:Topic[]}) {
  const makeDeck = () => shuffle(shuffle(topics).slice(0, 4).flatMap(topic => [{...topic,key:topic.id+'a'}, {...topic,key:topic.id+'b'}]));
  const [deck,setDeck] = useState(makeDeck), [open,setOpen] = useState<number[]>([]), [matched,setMatched] = useState<string[]>([]), [moves,setMoves] = useState(0);
  function flip(index:number) {
    if(open.includes(index) || matched.includes(deck[index].id) || open.length === 2) return;
    const next=[...open,index];setOpen(next);
    if(next.length === 2){setMoves(m=>m+1);if(deck[next[0]].id===deck[next[1]].id){setMatched(m=>[...m,deck[index].id]);setOpen([]);}}
  }
  return <div className="cf-mini-body"><p>Find matching syllabus topic names. Remember their positions.</p><p role="status">{matched.length} / {deck.length/2} pairs · {moves} turns{matched.length===deck.length/2?' · Complete!':''}</p><div className="cf-memory-grid">{deck.map((card,index)=><button key={card.key} className="cf-memory-card" disabled={matched.includes(card.id)} aria-label={open.includes(index)||matched.includes(card.id)?card.title:`Reveal card ${index+1}`} onClick={()=>flip(index)}>{open.includes(index)||matched.includes(card.id)?card.title:index+1}</button>)}</div>
    {open.length===2 && <button className="cf-text-button" onClick={()=>setOpen([])}>Try another pair</button>}
    <button className="cf-text-button" onClick={()=>{setDeck(makeDeck());setOpen([]);setMatched([]);setMoves(0);}}>Restart pairs</button></div>;
}
function Scramble({topics}:{topics:Topic[]}) {
  const create = () => {const topic=topics[Math.floor(Math.random()*topics.length)];return {title:topic.title,letters:shuffle(Array.from(topic.title)).join(' ')};};
  const [round,setRound]=useState(create),[answer,setAnswer]=useState(''),[message,setMessage]=useState(''),[solved,setSolved]=useState(false),[score,setScore]=useState(0);
  return <div className="cf-mini-body"><p>Unscramble the name of a topic in your syllabus.</p><p className="cf-scramble-letters">{round.letters}</p><form className="cf-study-form" onSubmit={event=>{event.preventDefault();if(solved)return;const correct=answer.trim().toLocaleLowerCase()===round.title.trim().toLocaleLowerCase();setMessage(correct?'Correct!':'Not quite. Try again.');if(correct){setSolved(true);setScore(n=>n+1);}}}><label htmlFor="cf-scramble-answer">Topic name</label><input id="cf-scramble-answer" value={answer} onChange={e=>setAnswer(e.target.value)} disabled={solved}/><button className="cf-primary" disabled={solved||!answer.trim()}>Check topic</button></form><p role="status">{message} · {score} solved</p>{solved&&<button className="cf-text-button" onClick={()=>{setRound(create());setAnswer('');setMessage('');setSolved(false);}}>Next scramble</button>}</div>;
}
