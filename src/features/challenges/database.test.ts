import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

// Run the actual host and challenge migrations with real PostgreSQL semantics.
// Only Supabase's auth schema/JWT delivery is simulated here.
const db = new PGlite();
const ids = Array.from({length:7}, (_,i)=>`00000000-0000-0000-0000-00000000000${i+1}`);
const room='10000000-0000-0000-0000-000000000001';
const session='20000000-0000-0000-0000-000000000001';
async function asUser(id: string) { await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${id}';`); }
async function snapshot() { return (await db.query<{value:any}>('select public.cf_snapshot($1,$2) as value',[room,session])).rows[0].value; }
async function start() { return db.query('select public.cf_start($1,$2)',[room,session]); }
async function submit(answer: string) { return (await db.query<{value:boolean}>('select public.cf_submit($1,$2,$3) as value',[room,session,answer])).rows[0].value; }
async function applyMigrations(target: PGlite) {
 await target.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 `);
 const migrations = new URL('../../../supabase/migrations/', import.meta.url);
 for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) {
   await target.exec(readFileSync(new URL(file, migrations), 'utf8'));
   if (file === '20260913000600_shared_questions.sql') await target.exec(readFileSync(new URL(file, migrations), 'utf8')); // Reruns must preserve the original delegates.
 }
}
beforeAll(async()=> {
 await applyMigrations(db);
 for(let i=0;i<ids.length;i++) {
   await db.query('insert into auth.users(id) values($1)',[ids[i]]);
   await db.query('insert into profiles(id,display_name) values($1,$2)',[ids[i],`Player ${i+1}`]);
 }
 await db.query('insert into rooms(id,name,join_code,created_by) values($1,$2,$3,$4)',[room,'Test room','CHALLENGE1',ids[0]]);
 await db.query('insert into sessions(id,room_id) values($1,$2)',[session,room]);
 for(const id of ids.slice(0,3)) { await db.query('insert into room_members values($1,$2)',[room,id]); await db.query('insert into session_presence(session_id,user_id) values($1,$2)',[session,id]); }
},30000);
afterAll(async()=>{await db.close();});
describe.sequential('database authorization and lifecycle',()=>{
 it('preserves host room, profile, presence and leaderboard authorization',async()=>{
   const host = new PGlite();
   try {
     await applyMigrations(host);
     await host.exec(readFileSync(new URL('../../../supabase/tests/rls.sql', import.meta.url), 'utf8'));
     expect((await host.query<{count:number}>('select count(*)::int as count from auth.users')).rows[0].count).toBe(0);
   } finally { await host.close(); }
 },30000);
 it('splits six clues and makes repeated starts idempotent',async()=>{
   await asUser(ids[0]); await start(); const a=await snapshot(); await start();
   expect((await snapshot()).challenge.id).toBe(a.challenge.id);
   expect(a.players).toHaveLength(3); expect(a.clues).toHaveLength(2);
   const direct=await db.query('select * from challenge_clues'); expect(direct.rows).toHaveLength(2);
   await asUser(ids[1]); const b=await snapshot(); expect(b.clues).toHaveLength(2);
   expect(b.clues.map((c:any)=>c.id).some((id:string)=>a.clues.some((c:any)=>c.id===id))).toBe(false);
 });
 it('blocks outsiders, anonymous access, direct writes and secret reads',async()=>{
   await asUser(ids[0]);
   await expect(db.query("update challenges set status='solved'")).rejects.toThrow();
   await expect(db.query("update challenge_clues set clue_text='changed'")).rejects.toThrow();
   await expect(db.query('update challenge_clues set assigned_to=$1',[ids[0]])).rejects.toThrow();
   await expect(db.query('delete from challenges')).rejects.toThrow();
   await expect(db.query('delete from challenge_clues')).rejects.toThrow();
   await expect(db.query("insert into challenges(room_id,session_id,type) values($1,$2,'split_puzzle')",[room,session])).rejects.toThrow();
   await expect(db.query("insert into challenge_clues(challenge_id,assigned_to,clue_text) select id,$1,'forged' from challenges",[ids[0]])).rejects.toThrow();
   await asUser(ids[6]); await expect(snapshot()).rejects.toThrow();
   expect((await db.query('select * from challenge_clues')).rows).toHaveLength(0);
   await expect(db.query("update challenges set status='solved'")).rejects.toThrow();
   await expect(db.query('select * from cf_private.puzzles')).rejects.toThrow();
   await db.exec('reset role; set role anon'); await expect(snapshot()).rejects.toThrow();
 });
 it('rejects wrong-session calls and counts successful solving once',async()=>{
   await asUser(ids[0]);
   await expect(db.query('select cf_snapshot($1,$2)',[room,'20000000-0000-0000-0000-000000000099'])).rejects.toThrow();
   expect(await submit('definitely incorrect')).toBe(false);
   const s=await snapshot(); const answer=s.challenge.title==='Complete the circuit'?'2 A':s.challenge.title==='Find the missing measurement'?'14':'Wednesday';
   expect(await submit(answer)).toBe(true); expect(await submit(answer)).toBe(true);
   expect((await snapshot()).challenge).toMatchObject({status:'solved',attempts:2});
 });
 it('supports 4–6 people and prevents late joiners from submitting',async()=>{
   for(let n=4;n<=6;n++) {
     await db.exec('reset role'); await db.query('insert into room_members values($1,$2)',[room,ids[n-1]]); await db.query('insert into session_presence(session_id,user_id) values($1,$2)',[session,ids[n-1]]);
     await asUser(ids[0]); await start(); expect((await snapshot()).players).toHaveLength(n);
     let total=0; for(const id of ids.slice(0,n)){await asUser(id); const s=await snapshot(); expect(s.clues.length).toBeGreaterThan(0); total+=s.clues.length;} expect(total).toBe(6);
     await db.query('select cf_cancel($1,$2)',[room,session]);
   }
   await asUser(ids[0]); await start();
   await db.exec('reset role'); await db.query('insert into room_members values($1,$2)',[room,ids[6]]); await db.query('insert into session_presence(session_id,user_id) values($1,$2)',[session,ids[6]]);
   await asUser(ids[6]); expect((await snapshot()).clues).toHaveLength(0); await expect(submit('2')).rejects.toThrow();
   await asUser(ids[0]); await db.query('select cf_cancel($1,$2)',[room,session]); await expect(start()).rejects.toThrow('1–6');
 });
 it('saves generated rounds atomically, keeps answers private and preserves practice puzzles',async()=>{
   await db.exec('reset role');
   await db.query('delete from session_presence where user_id=$1',[ids[6]]);
   const topic='30000000-0000-0000-0000-000000000001';
   await db.query('insert into syllabus_topics(id,room_id,title) values($1,$2,$3)',[topic,room,'Recursion']);
   const payload={full_answer:'42',clues:[{clue_text:'First partial clue',order_index:0},{clue_text:'Second partial clue',order_index:1},{clue_text:'Third partial clue',order_index:2}]};
   const save=()=>db.query<{id:string}>('select cf_save_generated($1,$2,$3,$4,$5::jsonb) as id',[room,session,ids[0],topic,JSON.stringify(payload)]);
   await asUser(ids[0]); await expect(save()).rejects.toThrow();
   await db.exec('reset role; set role service_role');
   const first=(await save()).rows[0].id; expect((await save()).rows[0].id).toBe(first);
   for(const id of ids.slice(0,6)) {
     await asUser(id); const value=await snapshot();
     expect(value.challenge.title).toBe('Recursion'); expect(value.clues).toHaveLength(1);
     const holder = ids.indexOf(id);
     expect(value.clues[0].clue_text).toContain(`Hint for Player ${(holder + 5) % 6 + 1}\n\n`);
     expect(value.challenge).not.toHaveProperty('full_answer');
     expect(value.clues.map((clue:any) => clue.clue_text)).not.toContain('42');
     await expect(db.query('select answers from cf_private.puzzles')).rejects.toThrow();
   }
   expect(await submit('wrong')).toBe(false); expect(await submit(' 42 ')).toBe(true);
   await asUser(ids[0]); await start(); expect((await snapshot()).challenge.title).not.toBe('Recursion');
   await db.query('select cf_cancel($1,$2)',[room,session]);
 });
 it('rejects ended sessions',async()=>{
   await db.exec('reset role'); await db.query('update sessions set is_active=false where id=$1',[session]);
   await asUser(ids[0]); await expect(start()).rejects.toThrow(); await expect(submit('2')).rejects.toThrow();
 });
});

it('allows only self avatar updates and rejects unknown avatar keys', async () => {
  await asUser(ids[0]);
  await db.query("update profiles set avatar_key='fox' where id=$1", [ids[0]]);
  expect((await db.query<{avatar_key:string}>('select avatar_key from profiles where id=$1',[ids[0]])).rows[0].avatar_key).toBe('fox');
  await db.query("update profiles set avatar_key='owl' where id=$1", [ids[1]]);
  await db.exec('reset role');
  expect((await db.query<{avatar_key:string}>('select avatar_key from profiles where id=$1',[ids[1]])).rows[0].avatar_key).toBe('initials');
  await asUser(ids[0]);
  await expect(db.query("update profiles set avatar_key='invalid' where id=$1",[ids[0]])).rejects.toThrow();
});

it('supports solo and pair generated rounds without losing a required clue, and credits wins once', async () => {
  await db.exec('reset role');
  await db.query('update sessions set is_active=true where id=$1',[session]);
  await db.query("update challenges set status='cancelled' where session_id=$1 and status='active'",[session]);
  await db.query('delete from session_presence where session_id=$1',[session]);
  await db.query('insert into session_presence(session_id,user_id) values($1,$2)',[session,ids[0]]);
  const topic='30000000-0000-0000-0000-000000000001';
  const payload={full_answer:'42',clues:[0,1,2].map(order_index=>({clue_text:`Required clue ${order_index}`,order_index}))};
  const save=()=>db.query('select cf_save_generated($1,$2,$3,$4,$5::jsonb)',[room,session,ids[0],topic,JSON.stringify(payload)]);
  await db.exec('set role service_role'); await save();
  await asUser(ids[0]); expect((await snapshot()).clues).toHaveLength(3);
  expect((await snapshot()).clues.every((clue:any)=>clue.clue_text.startsWith('Solo hint\n\n'))).toBe(true);
  const before=(await db.query<{solved_count:bigint,user_id:string}>('select * from cf_progress($1)',[room])).rows.find(row=>row.user_id===ids[0])!;
  await submit('42'); await submit('42');
  const after=(await db.query<{solved_count:bigint,user_id:string}>('select * from cf_progress($1)',[room])).rows.find(row=>row.user_id===ids[0])!;
  expect(Number(after.solved_count)).toBe(Number(before.solved_count)+1);
  await db.exec('reset role');
  await db.query('insert into session_presence(session_id,user_id) values($1,$2)',[session,ids[1]]);
  await db.exec('set role service_role'); await save();
  const clues=[];
  for (const id of ids.slice(0,2)) {
    await asUser(id); const value=await snapshot(); clues.push(...value.clues);
    expect(value.clues.every((clue:any)=>clue.clue_text.startsWith(`Hint for Player ${id===ids[0]?2:1}\n\n`))).toBe(true);
  }
  expect(new Set(clues.map(clue=>clue.clue_text)).size).toBe(3);
  await asUser('99999999-9999-4999-8999-999999999999');
  await expect(db.query('select * from cf_progress($1)',[room])).rejects.toThrow();
});

it('assigns different individual questions, swaps named hints, and requires every answer for a win', async () => {
  await db.exec('reset role');
  await db.query("update challenges set status='cancelled' where session_id=$1 and status='active'",[session]);
  const questions=Array.from({length:6},(_,i)=>({question:`Solve 2x = ${2*(i+2)}. Answer with x only.`,full_answer:String(i+2),hint:`Divide ${2*(i+2)} by 2.`}));
  const args=[room,session,ids[0],'30000000-0000-0000-0000-000000000001',JSON.stringify(questions)];
  await asUser(ids[0]);
  await expect(db.query('select cf_save_individual($1,$2,$3,$4,$5::jsonb)',args)).rejects.toThrow();
  await db.exec('reset role; set role service_role');
  await db.query('select cf_save_individual($1,$2,$3,$4,$5::jsonb)',args);
  await asUser(ids[0]); const first=await snapshot();
  expect(first.challenge.prompt).toBe(questions[0].question);
  expect(first.clues[0].clue_text).toContain('Hint for Player 2');
  expect(first.clues[0].clue_text).toContain(questions[1].hint);
  expect(first.challenge).not.toHaveProperty('answer');
  await expect(db.query('select * from cf_private.individual_questions')).rejects.toThrow();
  expect(await submit('3')).toBe(false);
  expect(await submit('2')).toBe(true);
  expect((await snapshot()).challenge).toMatchObject({status:'active',own_solved:true,solved_count:1});
  const attempts=(await snapshot()).challenge.attempts;
  expect(await submit('2')).toBe(true);
  expect((await snapshot()).challenge.attempts).toBe(attempts);
  await asUser(ids[2]); expect((await snapshot()).clues).toHaveLength(0);
  await expect(submit('4')).rejects.toThrow();
  await asUser(ids[1]); const second=await snapshot();
  expect(second.challenge.prompt).toBe(questions[1].question);
  expect(second.clues[0].clue_text).toContain('Hint for Player 1');
  expect(await submit('3')).toBe(true);
  expect((await snapshot()).challenge).toMatchObject({status:'solved',own_solved:true,solved_count:2});
});

it('keeps each answer private, blocks skipping, and unlocks only the caller hint after eight failures once', async () => {
  await db.exec('reset role; set role service_role');
  const questions=Array.from({length:6},(_,i)=>({question:`Compute ${i+10} + 2`,full_answer:String(i+12),hint:`Count two beyond ${i+10}.`}));
  const args=[room,session,ids[0],'30000000-0000-0000-0000-000000000001',JSON.stringify(questions)];
  const startRound=()=>db.query<{id:string}>('select cf_save_individual($1,$2,$3,$4,$5::jsonb) id',args);
  const id=(await startRound()).rows[0].id;
  expect((await startRound()).rows[0].id).toBe(id);
  await asUser(ids[0]);
  expect((await snapshot()).clues[0].hint_for_id).toBe(ids[1]);
  for(let i=0;i<7;i++) expect(await submit('wrong')).toBe(false);
  expect((await snapshot()).challenge.assistance_hint).toBeNull();
  expect(await submit('wrong')).toBe(false);
  expect((await snapshot()).challenge).toMatchObject({failed_attempts:8,penalty_points:1,assistance_hint:questions[0].hint,own_solved:false});
  await submit('wrong');
  expect((await snapshot()).challenge.penalty_points).toBe(1);
  await expect(db.query('select cf_cancel($1,$2)',[room,session])).rejects.toThrow('Everyone must solve');
  const progress=(await db.query<{user_id:string,penalty_points:bigint}>('select * from cf_progress($1)',[room])).rows;
  expect(Number(progress.find(p=>p.user_id===ids[0])!.penalty_points)).toBe(1);
  await asUser(ids[1]);
  expect((await snapshot()).challenge).toMatchObject({own_solved:false,failed_attempts:0,penalty_points:0,assistance_hint:null});
  expect(await submit(questions[0].full_answer)).toBe(false);
  expect(await submit(questions[1].full_answer)).toBe(true);
  expect((await snapshot()).challenge.status).toBe('active');
  await asUser(ids[0]); expect((await snapshot()).challenge.own_solved).toBe(false);
  expect(await submit(questions[0].full_answer)).toBe(true);
  expect((await snapshot()).challenge.status).toBe('solved');
  await db.exec('reset role; set role service_role');
  const duplicate=questions.map(q=>({...q,full_answer:'same'}));
  await expect(db.query('select cf_save_individual($1,$2,$3,$4,$5::jsonb)',[...args.slice(0,4),JSON.stringify(duplicate)])).rejects.toThrow('different answer');
});

it('shares one syllabus question, keeps answers private and requires every player to solve',async()=>{
 await db.exec('reset role');
 const topic='30000000-0000-0000-0000-000000009999';
 await db.query("insert into syllabus_topics(id,room_id,title) values($1,$2,'Shared algebra')",[topic,room]);
 await db.query('update sessions set is_active=true,ended_at=null where id=$1',[session]);
 await db.query("update challenges set status='cancelled' where session_id=$1 and status='active'",[session]);
 const roster=(await db.query<{user_id:string}>('select user_id from session_presence where session_id=$1 order by user_id',[session])).rows;
 const owner=roster[0].user_id;
 const cid=(await db.query<{id:string}>('select cf_save_shared_question($1,$2,$3,$4,$5,$6) as id',[room,session,owner,topic,'Solve x + 1 = 3. Answer with a number.','2'])).rows[0].id;
 for(const person of roster){await asUser(person.user_id);const value=await snapshot();expect(value.challenge.prompt).toBe('Solve x + 1 = 3. Answer with a number.');expect(value.challenge.shared_question).toBe(true);expect(value.clues).toEqual([]);}
 await asUser(owner);for(let i=0;i<8;i++)expect(await submit('wrong')).toBe(false);
 expect((await snapshot()).challenge.penalty_points).toBe(0);expect((await snapshot()).challenge.assistance_hint).toBeNull();
 for(let i=0;i<roster.length;i++){await asUser(roster[i].user_id);expect(await submit('2')).toBe(true);expect((await snapshot()).challenge.status).toBe(i===roster.length-1?'solved':'active');}
 await expect(db.query('select * from cf_private.individual_questions where challenge_id=$1',[cid])).rejects.toThrow();
});

it('runs room games without leaking answers, accepting duplicate votes, or altering study rounds',async()=>{
 await db.exec('reset role');
 const topic='30000000-0000-0000-0000-000000008888';
 await db.query("insert into syllabus_topics(id,room_id,title,status) values($1,$2,'Recursion','taught')",[topic,room]);
 const members=(await db.query<{user_id:string}>('select user_id from room_members where room_id=$1 order by user_id',[room])).rows;
 const owner=members[0].user_id;
 const payload={rounds:Array.from({length:5},(_,i)=>({prompt_text:`Question ${i}`,options:['A','B','C','D'],correct_option_index:1,explanation:'B is correct.'}))};
 await db.query('select cf_save_room_game($1,$2,$3,$4)',[room,owner,'trivia',JSON.stringify(payload)]);
 const snap=async()=> (await db.query<{value:any}>('select cf_game_snapshot($1) as value',[room])).rows[0].value;
 for(let round=0;round<5;round++){
  await asUser(owner);let state=await snap();expect(state.round.correct).toBeNull();expect(state.round.explanation).toBeNull();
  await expect(db.query('select correct_option_index from game_rounds')).rejects.toThrow();
  await expect(db.query('select * from game_answers')).rejects.toThrow();
  for(const member of members){await asUser(member.user_id);await db.query('select cf_game_answer($1,$2,1)',[room,state.round.id]);await db.query('select cf_game_answer($1,$2,0)',[room,state.round.id]);}
  state=await snap();expect(state.phase).toBe('reveal');expect(state.round.correct).toBe(1);expect(state.answers).toHaveLength(members.length);expect(state.players.every((p:any)=>p.score===round+1)).toBe(true);
  await expect(db.query('select cf_game_answer($1,$2,1)',[room,state.round.id])).rejects.toThrow();
  await db.exec('reset role');await db.query("update cf_private.game_state set deadline=now()-interval '1 second' where challenge_id=$1",[state.id]);
  await asUser(owner);state=await snap();expect(state.phase).toBe(round===4?'finished':'question');
 }
 await db.exec('reset role');
 await db.query('select cf_save_room_game($1,$2,$3,$4)',[room,owner,'mystery_voice',JSON.stringify({topic_id:topic,clues:['A function can call itself.','A stopping condition matters.','A smaller problem repeats the same method.']})]);
 await asUser(owner);let state=await snap();expect(state.answer).toBeNull();expect(state.clues).toHaveLength(1);
 const clues=await db.query('select clue_text from challenge_clues where challenge_id=$1',[state.id]);expect(clues.rows).toHaveLength(1);
 expect((await db.query<{value:boolean}>('select cf_game_guess($1,$2,$3) as value',[room,state.id,'recursin'])).rows[0].value).toBe(true);
 state=await snap();expect(state.phase).toBe('finished');expect(state.winner).toBe(owner);expect(state.answer).toBe('Recursion');
 await expect(db.query('select cf_game_guess($1,$2,$3)',[room,state.id,'recursion'])).rejects.toThrow();
 await db.exec('reset role');await db.query('select cf_save_flashcards($1,$2,$3)',[room,owner,JSON.stringify([{topic_id:topic,front_text:'What is recursion?',back_text:'A function calling itself.'}])]);
 await asUser(owner);expect((await db.query('select * from flashcards where room_id=$1',[room])).rows).toHaveLength(1);
 await expect(db.query("insert into flashcards(room_id,topic_id,front_text,back_text) values($1,$2,'bad','bad')",[room,topic])).rejects.toThrow();
});
it('enforces discussion deadlines and denies outsiders access to room games',async()=>{
 await db.exec('reset role');
 const owner=(await db.query<{user_id:string}>('select user_id from room_members where room_id=$1 limit 1',[room])).rows[0].user_id;
 const payload={rounds:Array.from({length:5},()=>({prompt_text:'Find the false statement',options:['True A','False B','True C'],correct_option_index:1,explanation:'B is false.'}))};
 const game=(await db.query<{id:string}>('select cf_save_room_game($1,$2,$3,$4) as id',[room,owner,'two_truths',JSON.stringify(payload)])).rows[0].id;
 await asUser(owner);let state=(await db.query<{value:any}>('select cf_game_snapshot($1) as value',[room])).rows[0].value;
 expect(state.type).toBe('two_truths');expect(Date.parse(state.deadline)-Date.parse(state.server_now)).toBeGreaterThan(35000);
 await db.exec('reset role');await db.query("update cf_private.game_state set deadline=now()-interval '1 second' where challenge_id=$1",[game]);
 await asUser(owner);await expect(db.query('select cf_game_answer($1,$2,1)',[room,state.round.id])).rejects.toThrow();
 state=(await db.query<{value:any}>('select cf_game_snapshot($1) as value',[room])).rows[0].value;expect(state.phase).toBe('reveal');expect(state.answers).toHaveLength(0);
 const outsider='00000000-0000-0000-0000-000000009999';await db.exec('reset role');await db.query('insert into auth.users(id) values($1)',[outsider]);await db.query("insert into profiles(id,display_name) values($1,'Outside')",[outsider]);
 await asUser(outsider);await expect(db.query('select cf_game_snapshot($1)',[room])).rejects.toThrow();expect((await db.query('select * from flashcards where room_id=$1',[room])).rows).toHaveLength(0);
});
it('supports untimed Spark answers, manual reveal/next, and ending games',async()=>{
 await db.exec('reset role');await db.query("update challenges set status='cancelled' where room_id=$1 and type in ('trivia','two_truths','mystery_voice') and status='active'",[room]);
 const owner=(await db.query<{user_id:string}>('select user_id from room_members where room_id=$1 limit 1',[room])).rows[0].user_id;
 const payload={rounds:Array.from({length:5},()=>({prompt_text:'Q',options:['A','B','C','D'],correct_option_index:1,explanation:'B is right'}))};
 const id=(await db.query<{id:string}>('select cf_save_room_game($1,$2,$3,$4) as id',[room,owner,'trivia',JSON.stringify(payload)])).rows[0].id;
 await db.query("update cf_private.game_state set deadline=now()-interval '1 day' where challenge_id=$1",[id]);
 await asUser(owner);let state=(await db.query<{value:any}>('select cf_game_snapshot($1) as value',[room])).rows[0].value;expect(state.phase).toBe('question');
 await db.query('select cf_game_answer($1,$2,1)',[room,state.round.id]);
 await db.query("select cf_game_control($1,$2,'end_question')",[room,id]);
 state=(await db.query<{value:any}>('select cf_game_snapshot($1) as value',[room])).rows[0].value;expect(state.phase).toBe('reveal');expect(state.round.correct).toBe(1);
 await db.query("select cf_game_control($1,$2,'next')",[room,id]);
 state=(await db.query<{value:any}>('select cf_game_snapshot($1) as value',[room])).rows[0].value;expect(state.round_index).toBe(1);
 await db.query("select cf_game_control($1,$2,'end_game')",[room,id]);
 state=(await db.query<{value:any}>('select cf_game_snapshot($1) as value',[room])).rows[0].value;expect(state.phase).toBe('finished');expect(state.players.find((p:any)=>p.id===owner).score).toBe(1);
});

it('protects Auth0 mappings while retaining UUID profile permissions', async () => {
  const id = '90000000-0000-0000-0000-000000000009';
  await db.exec(`reset role; insert into auth.users(id) values ('${id}');`);
  await asUser(id);
  await expect(db.query('insert into public.profiles(id,display_name,auth0_id) values ($1,$2,$3)', [id,'Test','forged-sub'])).rejects.toThrow();
  await db.query('insert into public.profiles(id,display_name) values ($1,$2)', [id,'Test']);
  await expect(db.query('update public.profiles set auth0_id=$1 where id=$2', ['forged-sub',id])).rejects.toThrow();
  await db.exec('reset role');
  await db.query('update public.profiles set auth0_id=$1 where id=$2',['trusted-sub',id]);
  await asUser(id);
  await db.query('update public.profiles set display_name=$1 where id=$2',['New name',id]);
  const result = await db.query<{id:string,auth0_id:string}>('select id,auth0_id from public.profiles where id=$1',[id]);
  expect(result.rows[0]).toEqual({id,auth0_id:'trusted-sub'});
  await db.exec('reset role');
});
