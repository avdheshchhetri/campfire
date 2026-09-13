import {ApiError,authorize,adminClient,bodyOf,sendError,uuid} from '../server/syllabus/teachback.js';
import {generateGame,generateCards} from '../server/games/generation.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  const body=bodyOf(req,12000),roomId=uuid(body.roomId,'Room ID');
  const {client,user}=await authorize(req,roomId);
  if(!['trivia','two_truths','mystery_voice','flashcards'].includes(body.type))throw new ApiError(400,'Choose a study activity.');
  const room=await client.from('rooms').select('subject').eq('id',roomId).single();
  let query=client.from('syllabus_topics').select('*').eq('room_id',roomId).order('order_index');
  if(body.type!=='flashcards')query=query.in('status',['taught','verified']);
  if(body.topicIds!==undefined){if(!Array.isArray(body.topicIds)||!body.topicIds.length||body.topicIds.length>5)throw new ApiError(400,'Choose up to five topics per batch.');query=query.in('id',body.topicIds.map(id=>uuid(id,'Topic ID')));}
  const result=await query;
  if(room.error||result.error)throw new ApiError(503,'Could not load the room syllabus.');
  if(!result.data?.length)throw new ApiError(400,body.type==='flashcards'?'Add syllabus topics first.':'Teach or verify a syllabus topic before starting a game.');
  const topics=result.data.map(t=>({id:t.id,title:t.title,content:String(t.content||t.description||'').slice(0,4000)}));
  const admin=adminClient();
  if(body.type==='flashcards'){
   if(topics.length>5)throw new ApiError(400,'Generate flashcards in batches of up to five topics.');
   const cards=await generateCards(topics,room.data.subject);
   const saved=await admin.rpc('cf_save_flashcards',{p_room:roomId,p_user:user.id,p_cards:cards});
   if(saved.error)throw new ApiError(503,'Could not save flashcards. Apply migration 007 and check server permissions.');
   return res.status(200).json({count:saved.data});
  }
  const existing=await client.from('challenges').select('id').eq('room_id',roomId).in('type',['trivia','mystery_voice','two_truths']).eq('status','active').limit(1).maybeSingle();
  if(existing.error)throw new ApiError(503,'Could not check the active game.');
  if(existing.data)return res.status(200).json({challengeId:existing.data.id});
  const payload=await generateGame(body.type,topics.slice(0,30),room.data.subject);
  const saved=await admin.rpc('cf_save_room_game',{p_room:roomId,p_user:user.id,p_type:body.type,p_payload:payload});
  if(saved.error)throw new ApiError(503,'Could not save the game. Apply migration 007 and check server permissions.');
  return res.status(200).json({challengeId:saved.data});
 }catch(error){return sendError(res,error);}
}
