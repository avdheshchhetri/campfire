import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ challengeContext: vi.fn(), generateGeminiChallenge: vi.fn(), adminClient: vi.fn() }));
vi.mock('./challengeGeneration.js', async original => ({ ...(await original()), challengeContext: mocks.challengeContext, generateGeminiChallenge: mocks.generateGeminiChallenge }));
vi.mock('../syllabus/teachback.js', async original => ({ ...(await original()), adminClient: mocks.adminClient }));
import generate from '../../api/generate-challenge-gemini.js';
import save from '../../api/save-challenge.js';
import { ApiError } from '../syllabus/teachback.js';
const puzzle = { full_answer: '42', clues: [{ clue_text: 'A', order_index: 0 }, { clue_text: 'B', order_index: 1 }] };
const context = { roomId: 'r', sessionId: 's', topicId: 't', user: { id: 'u' } };
let rpc;
async function invoke(handler, body = {}, method = 'POST') {
  const res = { setHeader: vi.fn(), status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await handler({ method, headers: { 'content-type': 'application/json' }, body }, res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.challengeContext.mockResolvedValue(context);
  mocks.generateGeminiChallenge.mockResolvedValue(puzzle);
  rpc = vi.fn().mockResolvedValue({ data: 'challenge-id', error: null });
  mocks.adminClient.mockReturnValue({ rpc });
});
it('returns the requested generator contract, and saves separately with the authenticated identity', async () => {
  expect((await invoke(generate)).body).toEqual(puzzle);
  expect(mocks.adminClient).not.toHaveBeenCalled();
  expect((await invoke(save, { challenge: puzzle, userId: 'forged' })).body).toEqual({ challengeId: 'challenge-id' });
  expect(rpc).toHaveBeenCalledWith('cf_save_generated', expect.objectContaining({ p_user: 'u', p_challenge: puzzle }));
});
it('does not generate or save before authorization succeeds', async () => {
  mocks.challengeContext.mockRejectedValue(new ApiError(403, 'Join this room.'));
  expect((await invoke(generate)).code).toBe(403);
  expect((await invoke(save, { challenge: puzzle })).code).toBe(403);
  expect(mocks.generateGeminiChallenge).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});
it('rejects GET, invalid saves and database conflicts', async () => {
  expect((await invoke(generate, {}, 'GET')).code).toBe(405);
  expect((await invoke(save, { challenge: {} })).code).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValue({ error: { code: 'P0001' } });
  expect((await invoke(save, { challenge: puzzle })).code).toBe(409);
});

it('saves individual answers privately and returns only the round ID', async () => {
  const questions=[{question:'Solve 2x=8',full_answer:'4',hint:'Divide by two'}];
  mocks.generateGeminiChallenge.mockResolvedValue({questions});
  const result=await invoke(generate,{mode:'individual'});
  expect(result.body).toEqual({challengeId:'challenge-id'});
  expect(JSON.stringify(result.body)).not.toContain('full_answer');
  expect(rpc).toHaveBeenCalledWith('cf_save_individual',expect.objectContaining({p_user:'u',p_questions:questions}));
});

it('saves the shared question server-side without returning its answer',async()=>{
 mocks.generateGeminiChallenge.mockResolvedValue({question:'Solve x+1=3',full_answer:'2'});
 const result=await invoke(generate,{mode:'shared'});
 expect(result.body).toEqual({challengeId:'challenge-id'});
 expect(rpc).toHaveBeenCalledWith('cf_save_shared_question',expect.objectContaining({p_question:'Solve x+1=3',p_answer:'2',p_user:'u'}));
});

it.each([['PGRST202','schema cache'],['42501','SERVICE_ROLE_KEY'],['P0001','session'],['23502','23502']])('reports safe save diagnostics for %s',async(code,message)=>{
 mocks.generateGeminiChallenge.mockResolvedValue({question:'Q',full_answer:'A'});
 rpc.mockResolvedValue({error:{code,message:'private database contents'}});
 const result=await invoke(generate,{mode:'shared'});
 expect(result.body.error).toContain(message);
 expect(result.body.error).not.toContain('private database contents');
});
