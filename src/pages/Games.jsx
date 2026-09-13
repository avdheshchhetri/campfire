import {useState} from 'react';
import {useOutletContext} from 'react-router-dom';
import {useAuth} from '../features/auth/AuthContext';
import {useRoomGame} from '../features/games/useRoomGame';
import {studyPost} from '../features/games/studyApi';
import SparkRound from '../features/games/SparkRound';
import EmberRiddle from '../features/games/EmberRiddle';
import TwoTruthsOneLie from '../features/games/TwoTruthsOneLie';
const activities=[['trivia','Spark Round','Five quick syllabus questions. Pick one answer in 20 seconds.'],['mystery_voice','The Ember Riddle','Listen to progressively clearer clues and buzz in with the topic.'],['two_truths','Two Truths, One Lie','Discuss three statements for 40 seconds, then identify the lie.']];
export default function Games(){const {room}=useOutletContext();return <RoomGames key={room.id} room={room}/>;}
function RoomGames({room}){
 const {user}=useAuth(),{game,error,loading,refresh,seconds}=useRoomGame(room.id);
 const [busy,setBusy]=useState(false),[failure,setFailure]=useState('');
 async function start(type){if(busy)return;setBusy(true);setFailure('');try{await studyPost('/api/room-study',{roomId:room.id,type});await refresh();}catch(e){setFailure(e.message);}finally{setBusy(false);}}
 const Component=game?.type==='trivia'?SparkRound:game?.type==='two_truths'?TwoTruthsOneLie:EmberRiddle;
 return <div className="space-y-6"><header><p className="eyebrow">LEARN TOGETHER</p><h1 className="font-display page-heading mt-3">Games</h1><p className="muted mt-3">Based on taught and verified topics. Scores belong to this game, not your study leaderboard.</p></header>
 {(error||failure)&&<p className="error-banner" role="alert">{failure||error}</p>}
 {loading?<p role="status">Opening room games…</p>:<><div className="feature-grid">{activities.map(([type,title,description])=><section className="feature-card" key={type}><h2 className="font-display">{title}</h2><p>{description}</p><button className="button mt-7" disabled={busy||Boolean(game&&game.phase!=='finished')} onClick={()=>start(type)}>{busy?'Preparing…':`Start ${title}`}</button></section>)}</div>
 {game&&<><Component key={game.id} game={game} roomId={room.id} userId={user.id} seconds={seconds} onChange={refresh}/><section className="panel space-y-3"><h2 className="font-display text-2xl">{game.phase==='finished'?'Final scoreboard':'Running scores'}</h2>{[...game.players].sort((a,b)=>b.score-a.score).map(p=><p key={p.id}>{p.name}: {game.type==='mystery_voice'?(game.winner===p.id?1:0):p.score}</p>)}{game.phase==='finished'&&game.type==='mystery_voice'&&<button className="button" disabled={busy} onClick={()=>start('mystery_voice')}>Next Riddle</button>}</section></>}
 </>}</div>;
}
