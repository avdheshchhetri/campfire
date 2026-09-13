import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabaseClient';
import {gameRpc} from './studyApi';
export function useRoomGame(roomId){
 const [game,setGame]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[now,setNow]=useState(Date.now());
 const live=useRef(false),busy=useRef(false),offset=useRef(0);
 const refresh=useCallback(async()=>{if(busy.current)return;busy.current=true;try{const value=await gameRpc('cf_game_snapshot',{p_room:roomId});if(live.current){if(value)offset.current=Date.parse(value.server_now)-Date.now();setGame(value);setError('');}}catch(e){if(live.current)setError(e.message);}finally{busy.current=false;if(live.current)setLoading(false);}},[roomId]);
 useEffect(()=>{live.current=true;void refresh();const channel=supabase.channel(`room-games:${roomId}:${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'challenges',filter:`room_id=eq.${roomId}`},refresh).subscribe();const poll=setInterval(refresh,1500),clock=setInterval(()=>setNow(Date.now()+offset.current),250);return()=>{live.current=false;clearInterval(poll);clearInterval(clock);void supabase.removeChannel(channel);};},[roomId,refresh]);
 return {game,error,loading,refresh,seconds:game?Math.max(0,Math.ceil((Date.parse(game.deadline)-now)/1000)):0};
}
