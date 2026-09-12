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
   await asUser(ids[0]); await db.query('select cf_cancel($1,$2)',[room,session]); await expect(start()).rejects.toThrow('3–6');
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
