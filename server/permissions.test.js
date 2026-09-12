import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('runs all migrations and the shared RLS acceptance suite with server-only verification', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    for (const file of [
      '20260912000100_shared_schema.sql',
      '20260912000200_access_and_room_functions.sql',
      '20260912000300_challenge_engine.sql',
      '20260912000400_challenge_permissions.sql',
      '20260912000500_teaching_permissions.sql',
    ]) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../supabase/tests/rls.sql', import.meta.url), 'utf8'));
    const result = await db.query("select has_column_privilege('authenticated','public.syllabus_topics','status','UPDATE') as can_forge");
    expect(result.rows[0].can_forge).toBe(false);
  } finally { await db.close(); }
}, 30000);
