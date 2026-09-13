import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({authorize:vi.fn(),adminClient:vi.fn(),generateGame:vi.fn(),generateCards:vi.fn()}));
vi.mock('../syllabus/teachback.js',async original=>({...await original(),authorize:mocks.authorize,adminClient:mocks.adminClient}));
vi.mock('./generation.js',()=>({generateGame:mocks.generateGame,generateCards:mocks.generateCards}));
import handler from '../../api/room-study.js';
import {ApiError} from '../syllabus/teachback.js';
const roomId='10000000-0000-0000-0000-000000000001';
let rpc;
function query(result){return {select(){return this;},eq(){return this;},in(){return this;},order(){return this;},limit(){return this;},single(){return Promise.resolve(result);},maybeSingle(){return Promise.resolve(result);},then(ok,bad){return Promise.resolve(result).then(ok,bad);}};}
async function invoke(body){const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method:'POST',headers:{'content-type':'application/json'},body:{roomId,...body}},res);return res;}
beforeEach(()=>{vi.clearAllMocks();rpc=vi.fn().mockResolvedValue({data:'id'});mocks.adminClient.mockReturnValue({rpc});mocks.authorize.mockResolvedValue({user:{id:'real-user'},client:{from:table=>query({data:table==='rooms'?{subject:'CS'}:table==='syllabus_topics'?[{id:'t',title:'Recursion',status:'verified'}]:null})}});mocks.generateGame.mockResolvedValue({rounds:[]});});
it('uses the authenticated identity and never returns generated answers',async()=>{const result=await invoke({type:'trivia',userId:'forged'});expect(result.body).toEqual({challengeId:'id'});expect(rpc).toHaveBeenCalledWith('cf_save_room_game',expect.objectContaining({p_user:'real-user',p_type:'trivia'}));});
it('does not call Gemini before room authorization or for unknown activities',async()=>{expect((await invoke({type:'unknown'})).code).toBe(400);mocks.authorize.mockRejectedValue(new ApiError(403,'Join room'));expect((await invoke({type:'trivia'})).code).toBe(403);expect(mocks.generateGame).not.toHaveBeenCalled();});
it('persists cards through the server-only save function',async()=>{mocks.generateCards.mockResolvedValue([{topic_id:'t',front_text:'Q',back_text:'A'}]);expect((await invoke({type:'flashcards'})).code).toBe(200);expect(rpc).toHaveBeenCalledWith('cf_save_flashcards',expect.objectContaining({p_user:'real-user'}));});
