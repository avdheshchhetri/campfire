import { afterEach, expect, it, vi } from 'vitest';
import { createSupabaseAdapter } from './supabaseAdapter';
const puzzle = { full_answer: '42', clues: [{ clue_text: 'A', order_index: 0 }, { clue_text: 'B', order_index: 1 }] };
function setup() {
  const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'user-jwt' } } }) }, rpc: vi.fn().mockResolvedValue({}) };
  const adapter = createSupabaseAdapter({ client: client as any, roomId: 'room', sessionId: 'session', userId: 'user' });
  return { adapter, client };
}
afterEach(() => vi.unstubAllGlobals());
it('generates then saves with the same subject/topic and the user token', async () => {
  const request = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => puzzle })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ challengeId: 'c' }) });
  vi.stubGlobal('fetch', request);
  const { adapter } = setup();
  await adapter.startGenerated!({ subject: 'CS', topicTitle: 'Recursion' });
  expect(request.mock.calls.map(call => call[0])).toEqual(['/api/generate-challenge-gemini', '/api/save-challenge']);
  expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer user-jwt');
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ roomId: 'room', sessionId: 'session', subject: 'CS', topicTitle: 'Recursion', challenge: puzzle });
});
it('does not save a failed generation or silently use the practice bank', async () => {
  const request = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Quota exhausted' }) });
  vi.stubGlobal('fetch', request);
  const { adapter, client } = setup();
  await expect(adapter.startGenerated!({ subject: 'CS', topicTitle: 'Recursion' })).rejects.toThrow('Quota exhausted');
  expect(request).toHaveBeenCalledTimes(1); expect(client.rpc).not.toHaveBeenCalled();
});
it('reuses generated content when retrying a failed save', async () => {
  const request = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => puzzle })
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Unavailable' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ challengeId: 'c' }) });
  vi.stubGlobal('fetch', request);
  const { adapter } = setup();
  const input = { subject: 'CS', topicTitle: 'Recursion' };
  await expect(adapter.startGenerated!(input)).rejects.toThrow('Unavailable');
  await adapter.startGenerated!(input);
  expect(request.mock.calls.map(call => call[0])).toEqual(['/api/generate-challenge-gemini', '/api/save-challenge', '/api/save-challenge']);
});
