import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

// Real PostgreSQL semantics in memory. Auth and parent tables are fixtures;
// hosted JWT delivery, realtime and parent RLS still require integration testing.
const db = new PGlite();
const ids = Array.from({length:7}, (_,i)=>`00000000-0000-0000-0000-00000000000${i+1}`);
const room='10000000-0000-0000-0000-000000000001';
const session='20000000-0000-0000-0000-000000000001';
async function asUser(id: string) { await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${id}';`); }
async function snapshot() { return (await db.query<{value:any}>('select public.cf_snapshot($1,$2) as value',[room,session])).rows[0].value; }
async function start() { return db.query('select public.cf_start($1,$2)',[room,session]); }
async function submit(answer: string) { return (await db.query<{value:boolean}>('select public.cf_submit($1,$2,$3) as value',[room,session,answer])).rows[0].value; }
beforeAll(async()=> {
 await db.exec(`
 create role anon; create role authenticated;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create table public.profiles(id uuid primary key, display_name text not null);
 create table public.rooms(id uuid primary key);
 create table public.room_members(room_id uuid references rooms(id),user_id uuid references profiles(id),primary key(room_id,user_id));
 create table public.sessions(id uuid primary key,room_id uuid references rooms(id),is_active boolean default true,ended_at timestamp);
 create table public.session_presence(session_id uuid references sessions(id),user_id uuid references profiles(id),primary key(session_id,user_id));
 create table public.challenges(id uuid primary key default gen_random_uuid(),room_id uuid references rooms(id),session_id uuid references sessions(id),type text not null,status text default 'active',created_at timestamp default now());
 create table public.challenge_clues(id uuid primary key default gen_random_uuid(),challenge_id uuid references challenges(id),assigned_to uuid references profiles(id),clue_text text not null,revealed boolean default true,order_index integer);
 insert into public.rooms values('${room}'); insert into public.sessions(id,room_id) values('${session}','${room}');
 `);
 await db.exec(readFileSync(new URL('../../../supabase/migrations/202609120001_challenge_engine.sql', import.meta.url),'utf8'));
 for(let i=0;i<ids.length;i++) await db.query('insert into profiles values($1,$2)',[ids[i],`Player ${i+1}`]);
 for(const id of ids.slice(0,3)) { await db.query('insert into room_members values($1,$2)',[room,id]); await db.query('insert into session_presence values($1,$2)',[session,id]); }
},30000);
afterAll(async()=>{await db.close();});
describe.sequential('database authorization and lifecycle',()=>{
 it('splits six clues and makes repeated starts idempotent',async()=>{
   await asUser(ids[0]); await start(); const a=await snapshot(); await start();
   expect((await snapshot()).challenge.id).toBe(a.challenge.id);
   expect(a.players).toHaveLength(3); expect(a.clues).toHaveLength(2);
   const direct=await db.query('select * from challenge_clues'); expect(direct.rows).toHaveLength(2);
   await asUser(ids[1]); const b=await snapshot(); expect(b.clues).toHaveLength(2);
   expect(b.clues.map((c:any)=>c.id).some((id:string)=>a.clues.some((c:any)=>c.id===id))).toBe(false);
 });
 it('blocks outsiders, anonymous access, direct writes and secret reads',async()=>{
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
     await db.exec('reset role'); await db.query('insert into room_members values($1,$2)',[room,ids[n-1]]); await db.query('insert into session_presence values($1,$2)',[session,ids[n-1]]);
     await asUser(ids[0]); await start(); expect((await snapshot()).players).toHaveLength(n);
     let total=0; for(const id of ids.slice(0,n)){await asUser(id); const s=await snapshot(); expect(s.clues.length).toBeGreaterThan(0); total+=s.clues.length;} expect(total).toBe(6);
     await db.query('select cf_cancel($1,$2)',[room,session]);
   }
   await asUser(ids[0]); await start();
   await db.exec('reset role'); await db.query('insert into room_members values($1,$2)',[room,ids[6]]); await db.query('insert into session_presence values($1,$2)',[session,ids[6]]);
   await asUser(ids[6]); expect((await snapshot()).clues).toHaveLength(0); await expect(submit('2')).rejects.toThrow();
   await asUser(ids[0]); await db.query('select cf_cancel($1,$2)',[room,session]); await expect(start()).rejects.toThrow('3–6');
 });
 it('rejects ended sessions',async()=>{
   await db.exec('reset role'); await db.query('update sessions set is_active=false where id=$1',[session]);
   await asUser(ids[0]); await expect(start()).rejects.toThrow(); await expect(submit('2')).rejects.toThrow();
 });
});
