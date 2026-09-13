import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../../supabaseClient.js', () => ({ supabase: { from: mocks.from } }));
import { writeState } from './campfireApi.js';
let writes;
let active;
let saved;
beforeEach(() => {
  writes = []; active = true; saved = [{ user_id: 'user' }];
  mocks.from.mockImplementation(table => {
    const query = {
      select: () => query, eq: () => query,
      single: async () => ({ data: { is_active: active, ended_at: null }, error: null }),
      upsert: async (values, options) => { writes.push({ kind: 'insert', values, options }); return { error: null }; },
      update: values => { writes.push({ kind: 'update', values }); return query; },
      then: (resolve, reject) => Promise.resolve({ data: saved, error: null }).then(resolve, reject),
    };
    return query;
  });
});
it('inserts missing membership without updating keys and writes the schema phone_state column', async () => {
  await writeState('session', 'user', 'down');
  expect(writes).toEqual([
    { kind: 'insert', values: { session_id: 'session', user_id: 'user' }, options: { onConflict: 'session_id,user_id', ignoreDuplicates: true } },
    { kind: 'update', values: { phone_state: 'down', updated_at: expect.any(String) } },
  ]);
});
it('does not write after observing an ended session', async () => {
  active = false;
  await expect(writeState('session', 'user', 'down')).rejects.toThrow('ended');
  expect(writes).toHaveLength(0);
});
it('reports when a presence update affects no rows', async () => {
  saved = [];
  await expect(writeState('session', 'user', 'up')).rejects.toThrow('Rejoin');
});
