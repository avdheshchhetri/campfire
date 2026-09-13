import {expect,it} from 'vitest';
import {presentChallenge} from './challengePresentation';
const snapshot:any={challenge:{prompt:'Combine your partial clues. Submit the short answer.'},players:[{user_id:'a'},{user_id:'b'}],clues:[{id:'one',clue_text:'Your clue: secret detail. Common Question: What is vector v? Format your answer as <x,y,z>.'},{id:'two',clue_text:'A second private detail.'}]};
it('recovers the actual common question and combines slots without losing private information',()=>{
 const result=presentChallenge(snapshot);
 expect(result.challenge?.prompt).toBe('What is vector v? Format your answer as <x,y,z>.');
 expect(result.challenge?.prompt).not.toContain('secret');
 expect(result.clues).toHaveLength(1);expect(result.clues[0].clue_text).toContain('second private detail');
});
it('does not modify individual questions or invent missing legacy questions',()=>{
 const individual={...snapshot,challenge:{...snapshot.challenge,individual:true}};
 expect(presentChallenge(individual)).toBe(individual);
 expect(presentChallenge({...snapshot,clues:[]}).challenge?.prompt).toContain('did not store');
});
