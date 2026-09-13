import {useState} from 'react';
import {gameRpc} from './studyApi';
export default function ChoiceGame({game,roomId,userId,seconds,onChange}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const own=game.answers.find(a=>a.user_id===userId),revealed=game.phase!=='question';
 async function choose(index){if(busy||own||revealed)return;setBusy(true);setError('');try{await gameRpc('cf_game_answer',{p_room:roomId,p_round:game.round.id,p_option:index});await onChange();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="panel space-y-6"><header><p className="eyebrow">Round {game.round_index+1} of {game.total}</p><h2 className="font-display text-2xl mt-3">{game.round.prompt}</h2><p className="muted mt-3" role="timer">{game.phase==='finished'?'Game complete':revealed?`Next round in ${seconds}s`:`${seconds}s to ${game.type==='two_truths'?'discuss and vote':'answer'}`}</p></header>
 <div className="space-y-3">{game.round.options.map((option,index)=><button key={index} className={`button ${own?.selected===index?'':'button-secondary'} w-full`} disabled={busy||Boolean(own)||revealed||seconds===0||!game.participants.includes(userId)} aria-pressed={own?.selected===index} onClick={()=>choose(index)}>{option}{revealed&&game.round.correct===index?' ✓':''}</button>)}</div>
 {!game.participants.includes(userId)&&<p className="muted">You joined after this game started. You can watch and play the next game.</p>}
 {own&&!revealed&&<p role="status">Answer saved. Waiting for the group.</p>}{error&&<p role="alert" className="error-banner">{error}</p>}
 {revealed&&<div className="space-y-3"><p><strong>{game.type==='two_truths'?'The lie':'Correct answer'}:</strong> {game.round.options[game.round.correct]}</p><p>{game.round.explanation}</p><ul>{game.players.map(player=>{const answer=game.answers.find(a=>a.user_id===player.id);return <li key={player.id}>{player.name}: {answer?answer.correct?'Correct':'Incorrect':'No answer'}</li>;})}</ul></div>}
 </section>;
}
