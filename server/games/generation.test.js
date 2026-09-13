import {expect,it} from 'vitest';
import {validateGame} from './generation.js';
const topics=[{id:'t',title:'Recursion'}];
it('validates five distinct-option rounds and an in-range correct choice',()=>{
 const rounds=Array.from({length:5},()=>({prompt_text:'Question',options:['a','b','c','d'],correct_option_index:2,explanation:'Because'}));
 expect(validateGame({rounds},'trivia',topics).rounds).toHaveLength(5);
 expect(()=>validateGame({rounds:[...rounds.slice(1)]},'trivia',topics)).toThrow();
 expect(()=>validateGame({rounds:rounds.map(r=>({...r,correct_option_index:4}))},'trivia',topics)).toThrow();
 expect(()=>validateGame({rounds},'two_truths',topics)).toThrow();
});
it('rejects riddles that name the answer or use an unknown topic',()=>{
 expect(()=>validateGame({topic_id:'t',clues:['Recursion is useful','Second','Third']},'mystery_voice',topics)).toThrow();
 expect(()=>validateGame({topic_id:'other',clues:['First','Second','Third']},'mystery_voice',topics)).toThrow();
 expect(validateGame({topic_id:'t',clues:['First','Second','Third']},'mystery_voice',topics).clues).toHaveLength(3);
});
