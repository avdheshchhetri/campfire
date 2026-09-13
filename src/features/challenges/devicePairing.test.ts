import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Execute the real migrations. Only Supabase's JWT delivery and auth.users are
// simulated; grants, row locks, foreign keys and security-definer RPCs are SQL.
const db = new PGlite();
const migrations = new URL('../../../supabase/migrations/', import.meta.url);
const pairingMigration = readFileSync(new URL('20260913000100_device_pairing.sql', migrations), 'utf8');
const alice = '00000000-0000-0000-0000-000000000001';
const bob = '00000000-0000-0000-0000-000000000002';
const unprofiled = '00000000-0000-0000-0000-000000000003';
const room = '10000000-0000-0000-0000-000000000001';
const otherRoom = '10000000-0000-0000-0000-000000000002';
const session = '20000000-0000-0000-0000-000000000001';
const otherSession = '20000000-0000-0000-0000-000000000002';
const laterSession = '20000000-0000-0000-0000-000000000003';
const token = 'a1'.repeat(32);
const otherToken = 'b2'.repeat(32);

interface PairCode { id: string; pairing_code: string; created_at: string }
interface Identity { user_id: string; display_name: string; avatar_url: string | null }
interface ResolvedPair extends Identity {
  device_id: string;
  sessions: { id: string; room_id: string; room_name: string; started_at: string }[];
}

async function admin() { await db.exec("reset role; set request.jwt.claim.sub = '';"); }
async function asUser(id = alice) {
  await db.exec('reset role; set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function asPhone() { await db.exec("reset role; set role anon; set request.jwt.claim.sub = '';"); }
async function create(label: string | null = 'Phone'): Promise<PairCode> {
  return (await db.query<{ value: PairCode }>('select public.create_device_pair($1) as value', [label])).rows[0].value;
}
async function claim(code: string | null, secret: string | null = token): Promise<Identity> {
  return (await db.query<{ value: Identity }>('select public.claim_device_pair($1,$2) as value', [code, secret])).rows[0].value;
}
async function resolve(secret: string | null = token): Promise<ResolvedPair> {
  return (await db.query<{ value: ResolvedPair }>('select public.resolve_device_pair($1) as value', [secret])).rows[0].value;
}
async function presence(state: string | null, sessionId: string | null = session, secret: string | null = token) {
  await db.query('select public.set_device_presence($1,$2,$3)', [secret, sessionId, state]);
}
async function pairPhone(secret = token) {
  await asUser();
  const code = await create();
  await asPhone();
  await claim(code.pairing_code, secret);
  return code;
}

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  for (const id of [alice, bob, unprofiled]) await db.query('insert into auth.users values ($1)', [id]);
  await db.query("insert into profiles(id,display_name,avatar_url) values ($1,'Alice','flame'),($2,'Bob',null)", [alice, bob]);
  await db.query("insert into rooms(id,name,join_code,created_by) values ($1,'Biology','PAIRROOM1',$3),($2,'Private room','PAIRROOM2',$4)", [room, otherRoom, alice, bob]);
  await db.query("insert into sessions(id,room_id,started_at) values ($1,$4,'2026-09-13 10:00'),($2,$5,'2026-09-13 11:00'),($3,$4,'2026-09-13 12:00')", [session, otherSession, laterSession, room, otherRoom]);
}, 30000);

beforeEach(async () => {
  await admin();
  await db.exec('delete from public.paired_devices; delete from public.session_presence; delete from public.room_members; update public.sessions set is_active=true, ended_at=null;');
  await db.query('insert into room_members(room_id,user_id) values ($1,$3),($1,$4),($2,$4)', [room, otherRoom, alice, bob]);
  await db.query("update profiles set display_name='Alice',avatar_url='flame' where id=$1", [alice]);
  await db.query("update profiles set avatar_url=null where id=$1", [bob]);
});
afterAll(async () => { await db.close(); });

describe.sequential('paired secondary phone database boundary', () => {
  it('adds exactly the supplied table shape, protected by RLS', async () => {
    const columns = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema='public' and table_name='paired_devices' order by ordinal_position");
    expect(columns.rows.map(row => row.column_name)).toEqual(['id', 'user_id', 'device_label', 'pairing_code', 'local_token', 'paired_at', 'created_at']);
    const security = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid='public.paired_devices'::regclass");
    expect(security.rows[0].relrowsecurity).toBe(true);
  });

  it('creates unique six-character codes for the signed-in profile without exposing a token', async () => {
    await asUser();
    const codes: PairCode[] = [];
    for (let i = 0; i < 16; i++) codes.push(await create('  Alice phone  '));
    expect(new Set(codes.map(code => code.pairing_code)).size).toBe(16);
    for (const code of codes) {
      expect(code.pairing_code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
      expect(Object.keys(code).sort()).toEqual(['created_at', 'id', 'pairing_code']);
    }
    await admin();
    const rows = (await db.query<{ user_id: string; device_label: string; local_token: string | null; paired_at: string | null }>('select user_id,device_label,local_token,paired_at from paired_devices')).rows;
    expect(rows.every(row => row.user_id === alice && row.device_label === 'Alice phone' && row.local_token === null && row.paired_at === null)).toBe(true);
  });

  it('requires authenticated creation and an existing profile, preserving optional labels', async () => {
    await asPhone();
    await expect(create()).rejects.toMatchObject({ code: '42501' });
    await asUser('');
    await expect(create()).rejects.toMatchObject({ code: '28000' });
    await asUser(unprofiled);
    await expect(create()).rejects.toMatchObject({ code: '28000' });
    await asUser();
    await expect(create('x'.repeat(81))).rejects.toMatchObject({ code: '22023' });
    const code = (await db.query<{ value: PairCode }>('select create_device_pair() as value')).rows[0].value;
    await admin();
    expect((await db.query<{ device_label: string | null }>('select device_label from paired_devices where id=$1', [code.id])).rows[0].device_label).toBeNull();
  });

  it('claims anonymously, retries idempotently, and never shares Supabase identity or secret fields', async () => {
    await asUser();
    const code = await create();
    await asPhone();
    const identity = await claim(` ${code.pairing_code.toLowerCase()} `, token.toUpperCase());
    expect(identity).toEqual({ user_id: alice, display_name: 'Alice', avatar_url: 'flame' });
    expect(await claim(code.pairing_code)).toEqual(identity);
    const paired = await resolve();
    expect(paired).toMatchObject({ device_id: code.id, ...identity });
    expect(Object.keys(paired).sort()).toEqual(['avatar_url', 'device_id', 'display_name', 'sessions', 'user_id']);
    expect(paired.sessions.map(value => value.id)).toEqual([laterSession, session]);
    expect(paired.sessions[0]).toMatchObject({ room_id: room, room_name: 'Biology' });
    expect(Object.keys(paired.sessions[0]).sort()).toEqual(['id', 'room_id', 'room_name', 'started_at']);
    await admin();
    const first = (await db.query<{ paired_at: string; local_token: string }>('select paired_at::text,local_token from paired_devices where id=$1', [code.id])).rows[0];
    expect(first.local_token).toBe(token);
    await db.query("update paired_devices set created_at=now()-interval '1 day' where id=$1", [code.id]);
    await asPhone();
    expect(await claim(code.pairing_code)).toEqual(identity);
    await admin();
    expect((await db.query<{ paired_at: string }>('select paired_at::text from paired_devices where id=$1', [code.id])).rows[0].paired_at).toBe(first.paired_at);
  });

  it('rejects code replay by a different token and token reuse for a second pairing', async () => {
    const code = await pairPhone();
    await expect(claim(code.pairing_code, otherToken)).rejects.toThrow('already been used');
    await asUser(bob);
    const bobCode = await create();
    await asPhone();
    await expect(claim(bobCode.pairing_code)).rejects.toThrow('already paired');
    expect((await resolve()).user_id).toBe(alice);
    expect((await claim(bobCode.pairing_code, otherToken)).user_id).toBe(bob);
    expect((await resolve(otherToken)).user_id).toBe(bob);
  });

  it('rejects expired or nonexistent codes without claiming the row', async () => {
    await asUser();
    const code = await create();
    await admin();
    await db.query("update paired_devices set created_at=now()-interval '16 minutes' where id=$1", [code.id]);
    await asPhone();
    await expect(claim(code.pairing_code)).rejects.toThrow('expired');
    for (const badCode of [null, '', 'NOT-A-CODE']) await expect(claim(badCode)).rejects.toThrow('invalid or expired');
    await expect(resolve()).rejects.toMatchObject({ code: '28000' });
    await admin();
    expect((await db.query<{ local_token: string | null; paired_at: string | null }>('select local_token,paired_at from paired_devices where id=$1', [code.id])).rows[0]).toEqual({ local_token: null, paired_at: null });
  });

  it('rejects malformed and unknown tokens, and makes deleted pairings unusable', async () => {
    await asUser();
    const code = await create();
    await asPhone();
    for (const badToken of [null, '', 'a'.repeat(63), 'g'.repeat(64), `${token} `]) {
      await expect(claim(code.pairing_code, badToken)).rejects.toMatchObject({ code: '22023' });
      await expect(resolve(badToken)).rejects.toMatchObject({ code: '28000' });
      await expect(presence('down', session, badToken)).rejects.toMatchObject({ code: '28000' });
    }
    await expect(resolve(token)).rejects.toMatchObject({ code: '28000' });
    await expect(presence('down', session, token)).rejects.toMatchObject({ code: '28000' });
    await claim(code.pairing_code);
    await admin();
    await db.query('delete from paired_devices where id=$1', [code.id]);
    await asPhone();
    await expect(resolve()).rejects.toMatchObject({ code: '28000' });
    await expect(presence('down')).rejects.toMatchObject({ code: '28000' });
  });

  it('upserts only the token owner presence and refreshes a single row on repeated writes', async () => {
    await pairPhone();
    await presence('down');
    await admin();
    await db.query("update session_presence set updated_at=now()-interval '1 day' where session_id=$1 and user_id=$2", [session, alice]);
    // Even an authenticated caller with Bob's JWT can only write Alice's state
    // with Alice's pairing token. No user_id argument can be forged by a phone.
    await asUser(bob);
    await presence('up');
    await presence('up');
    await admin();
    const rows = (await db.query<{ session_id: string; user_id: string; phone_state: string; fresh: boolean }>("select session_id,user_id,phone_state,updated_at > now()-interval '1 minute' as fresh from session_presence")).rows;
    expect(rows).toEqual([{ session_id: session, user_id: alice, phone_state: 'up', fresh: true }]);
  });

  it('rejects invalid states, cross-room sessions, ended sessions and removed membership', async () => {
    await pairPhone();
    for (const badState of [null, '', 'sideways', 'DOWN']) await expect(presence(badState)).rejects.toMatchObject({ code: '22023' });
    await expect(presence('down', null)).rejects.toThrow('not a room member');
    await expect(presence('down', otherSession)).rejects.toThrow('not a room member');
    await admin();
    // Each ending flag is sufficient on its own.
    await db.query('update sessions set is_active=false where id=$1', [session]);
    await db.query('update sessions set ended_at=now() where id=$1', [laterSession]);
    await asPhone();
    await expect(presence('down', session)).rejects.toThrow('ended');
    await expect(presence('down', laterSession)).rejects.toThrow('ended');
    expect((await resolve()).sessions).toEqual([]);
    await admin();
    await db.exec('update sessions set is_active=true, ended_at=null');
    await db.query('delete from room_members where room_id=$1 and user_id=$2', [room, alice]);
    await asPhone();
    await expect(presence('down')).rejects.toThrow('not a room member');
    expect((await resolve()).sessions).toEqual([]);
    await admin();
    expect((await db.query('select * from session_presence')).rows).toEqual([]);
  });

  it('denies raw pairing/token access and grants only the intended role capabilities', async () => {
    await pairPhone();
    for (const role of ['anon', 'authenticated']) {
      if (role === 'anon') await asPhone(); else await asUser();
      await expect(db.query('select local_token from paired_devices')).rejects.toMatchObject({ code: '42501' });
      await expect(db.query('select pairing_code from paired_devices')).rejects.toMatchObject({ code: '42501' });
      await expect(db.query("insert into paired_devices(user_id,pairing_code) values ($1,'FORGED')", [alice])).rejects.toMatchObject({ code: '42501' });
      await expect(db.query("update paired_devices set local_token=$1", [otherToken])).rejects.toMatchObject({ code: '42501' });
      await expect(db.query('delete from paired_devices')).rejects.toMatchObject({ code: '42501' });
      expect((await resolve()).user_id).toBe(alice);
    }
    await asPhone();
    await expect(db.query('select * from profiles')).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select * from sessions')).rejects.toMatchObject({ code: '42501' });
    await expect(db.query("insert into session_presence(session_id,user_id,phone_state) values ($1,$2,'down')", [session, alice])).rejects.toMatchObject({ code: '42501' });
    await admin();
    const grants = (await db.query<{ grantee: string; routine_name: string }>("select grantee,routine_name from information_schema.routine_privileges where specific_schema='public' and routine_name in ('create_device_pair','claim_device_pair','resolve_device_pair','set_device_presence') and grantee in ('PUBLIC','anon','authenticated') order by grantee,routine_name")).rows;
    expect(grants).toEqual([
      { grantee: 'anon', routine_name: 'claim_device_pair' },
      { grantee: 'anon', routine_name: 'resolve_device_pair' },
      { grantee: 'anon', routine_name: 'set_device_presence' },
      { grantee: 'authenticated', routine_name: 'claim_device_pair' },
      { grantee: 'authenticated', routine_name: 'create_device_pair' },
      { grantee: 'authenticated', routine_name: 'resolve_device_pair' },
      { grantee: 'authenticated', routine_name: 'set_device_presence' },
    ]);
  });

  it('allows own avatar and display-name updates while preserving profile and member boundaries', async () => {
    await pairPhone();
    await asUser();
    await db.query("update profiles set avatar_url='leaf',display_name='Alice renamed' where id=$1", [alice]);
    await db.query("update profiles set avatar_url='moon' where id=$1", [bob]);
    await expect(db.query('update profiles set id=$1 where id=$2', [unprofiled, alice])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('update profiles set created_at=now() where id=$1', [alice])).rejects.toMatchObject({ code: '42501' });
    await asPhone();
    expect(await resolve()).toMatchObject({ display_name: 'Alice renamed', avatar_url: 'leaf' });
    await admin();
    expect((await db.query<{ avatar_url: string | null }>('select avatar_url from profiles where id=$1', [bob])).rows[0].avatar_url).toBeNull();
  });

  it('can be reapplied without data loss, including already-registered realtime tables', async () => {
    const code = await pairPhone();
    await admin();
    // First application already exercised the absence of a Realtime publication.
    await db.exec('create publication supabase_realtime;');
    await db.exec(pairingMigration);
    await db.exec(pairingMigration);
    const published = (await db.query<{ tablename: string }>("select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename")).rows;
    expect(published.map(row => row.tablename)).toEqual(['session_presence', 'sessions']);
    await asPhone();
    expect((await resolve()).device_id).toBe(code.id);
    expect((await claim(code.pairing_code)).user_id).toBe(alice);
  });
});
