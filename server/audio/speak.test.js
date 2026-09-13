import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({authorize:vi.fn()}));
vi.mock('../syllabus/teachback.js',async original=>({...await original(),authorize:mocks.authorize}));
import speak,{TUTOR_VOICE_ID,MOODS} from '../../api/speak.js';
import {ApiError} from '../syllabus/teachback.js';
const roomId='10000000-0000-0000-0000-000000000001';
const request=vi.fn();
async function invoke(body={},method='POST') {
 const res={setHeader:vi.fn(),status(code){this.code=code;return this;},json(value){this.body=value;return this;}};
 await speak({method,headers:{'content-type':'application/json',authorization:'Bearer user'},body:{roomId,text:'What does recursion do?',mood:'neutral',...body}},res);return res;
}
beforeEach(()=>{vi.stubEnv('ELEVENLABS_API_KEY','test-server-secret');vi.stubEnv('ELEVENLABS_VOICE_ID','');vi.stubGlobal('fetch',request);request.mockReset();mocks.authorize.mockReset().mockResolvedValue({user:{id:'u'}});});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('uses one fixed voice, server-only credentials, and valid mood settings',async()=>{
 for(const mood of Object.keys(MOODS)) {
  request.mockResolvedValueOnce(new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/mpeg'}}));
  const result=await invoke({mood});expect(result.code).toBe(200);expect(result.body).toEqual({audio:'AQID',mimeType:'audio/mpeg'});
  const [url,options]=request.mock.calls.at(-1);
  expect(url).toContain(TUTOR_VOICE_ID);expect(options.headers['xi-api-key']).toBe('test-server-secret');
  expect(JSON.parse(options.body).voice_settings).toEqual(MOODS[mood]);
  expect(JSON.stringify(result.body)).not.toContain('test-server-secret');
 }
});
it('rejects invalid inputs and unauthenticated callers before spending credits',async()=>{
 expect((await invoke({},'GET')).code).toBe(405);
 expect((await invoke({text:'a'.repeat(2001)})).code).toBe(400);
 expect((await invoke({mood:'angry'})).code).toBe(400);
 mocks.authorize.mockRejectedValueOnce(new ApiError(403,'Join this room.'));
 expect((await invoke()).code).toBe(403);expect(request).not.toHaveBeenCalled();
});
it('handles missing keys, provider failure, timeouts and invalid audio without returning secret details',async()=>{
 vi.stubEnv('ELEVENLABS_API_KEY','');expect((await invoke()).code).toBe(503);
 vi.stubEnv('ELEVENLABS_API_KEY','test-server-secret');
 request.mockResolvedValueOnce(new Response('private provider details',{status:429}));
 const failed=await invoke();expect(failed.code).toBe(429);expect(failed.body.error).not.toContain('private provider');
 request.mockRejectedValueOnce(new Error('network'));expect((await invoke()).code).toBe(504);
 request.mockResolvedValueOnce(new Response('{}',{headers:{'content-type':'application/json'}}));expect((await invoke()).code).toBe(502);
});

it.each([
 [401, 'invalid_api_key', 'rejected the API key'],
 [401, 'missing_permissions', 'allows Text to Speech'],
 [404, 'voice_not_found', 'cannot access the selected tutor voice'],
 [402, 'paid_plan_required', 'not available on your ElevenLabs plan'],
 [401, 'quota_exceeded', 'credit or plan limit'],
 [503, 'unknown', 'HTTP 503'],
])('explains provider HTTP %s / %s without exposing raw details', async (status, code, message) => {
 request.mockResolvedValueOnce(new Response(JSON.stringify({detail:{code,message:'private provider details test-server-secret'}}),{status}));
 const result=await invoke();
 expect(result.body.error).toContain(message);
 expect(JSON.stringify(result.body)).not.toContain('test-server-secret');
 expect(JSON.stringify(result.body)).not.toContain('private provider details');
});
