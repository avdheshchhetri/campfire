import {expect,it} from 'vitest';
import {validateSharedQuestion} from './sharedQuestion.js';
it('requires one self-contained question and a short answer, without clue fields',()=>{
 expect(validateSharedQuestion({question:' Solve x+1=3. ',full_answer:' 2 '})).toEqual({question:'Solve x+1=3.',full_answer:'2'});
 for(const value of [{question:'',full_answer:'2'},{question:'Q',full_answer:'a'.repeat(161)},{question:'Q',full_answer:'2',clues:[]}])expect(()=>validateSharedQuestion(value)).toThrow();
});
