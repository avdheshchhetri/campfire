import { afterEach, expect, it, vi } from 'vitest';
import { requestSpeech } from './speechApi';
const mocks=vi.hoisted(()=>({session:vi.fn()}));
vi.mock('../../lib/supabaseClient.js',()=>({supabase:{auth:{getSession:mocks.session}}}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('aborts a stalled sign-in lookup so audio cannot load forever',async()=>{
 mocks.session.mockReturnValue(new Promise(()=>{}));
 const controller=new AbortController();const promise=requestSpeech({roomId:'r',text:'Question',mood:'neutral',signal:controller.signal});
 const assertion=expect(promise).rejects.toThrow('Audio took too long');controller.abort();await assertion;
});
it('sends the caller token and returns only an audio URL without any server key',async()=>{
 mocks.session.mockResolvedValue({data:{session:{access_token:'test-user-token'}}});
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({mimeType:'audio/mpeg',audio:'AQID'})});vi.stubGlobal('fetch',fetch);
 expect(await requestSpeech({roomId:'r',text:'Question',mood:'neutral',signal:new AbortController().signal})).toBe('data:audio/mpeg;base64,AQID');
 expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-user-token');
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({roomId:'r',text:'Question',mood:'neutral'});
});
