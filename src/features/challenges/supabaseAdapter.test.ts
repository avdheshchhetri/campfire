import { afterEach, expect, it, vi } from 'vitest';
import { createSupabaseAdapter } from './supabaseAdapter';
function setup() {
  const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'user-jwt' } } }) }, rpc: vi.fn().mockResolvedValue({}) };
  const adapter = createSupabaseAdapter({ client: client as any, roomId: 'room', sessionId: 'session', userId: 'user' });
  return { adapter, client };
}
afterEach(() => vi.unstubAllGlobals());
it('requests individual generation and save server-side without receiving answers', async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ challengeId: 'c' }) });
  vi.stubGlobal('fetch', request);
  const { adapter } = setup();
  await adapter.startGenerated!({ subject: 'Maths', topicTitle: 'Algebra' });
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe('/api/generate-challenge-gemini');
  expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer user-jwt');
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ roomId: 'room', sessionId: 'session', subject: 'Maths', topicTitle: 'Algebra', mode: 'shared' });
});
it('does not save a failed generation or silently use the practice bank', async () => {
  const request = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Quota exhausted' }) });
  vi.stubGlobal('fetch', request);
  const { adapter, client } = setup();
  await expect(adapter.startGenerated!({ subject: 'CS', topicTitle: 'Recursion' })).rejects.toThrow('Quota exhausted');
  expect(request).toHaveBeenCalledTimes(1); expect(client.rpc).not.toHaveBeenCalled();
});
