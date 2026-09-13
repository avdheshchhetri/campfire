import { expect, it } from 'vitest';
import { validateVariants } from './questionVariants.js';
const payload = () => ({ template: 'Solve {1}x + {2} = {3}. Answer with x only.', variants: Array.from({length:6},(_,i)=>({values:['2',String(i+1),String(2*(i+2)+i+1)],full_answer:String(i+2),hint:'Subtract the constant, then divide by the coefficient.'})) });
it('uses exactly the same maths question format with different numbers', () => {
  const { questions } = validateVariants(payload(), 'Maths');
  expect(questions).toHaveLength(6);
  expect(new Set(questions.map(q=>q.question.replace(/\d+/g,'#'))).size).toBe(1);
  expect(new Set(questions.map(q=>q.question)).size).toBe(6);
  expect(questions[0].full_answer).toBe('2');
});
it('rejects repeated variants, missing values and nonnumeric maths substitutions', () => {
  let input=payload(); input.variants[1]=input.variants[0];
  expect(()=>validateVariants(input,'Maths')).toThrow();
  input=payload(); input.variants[0].values.pop();
  expect(()=>validateVariants(input,'Maths')).toThrow();
  input=payload(); input.variants[0].values[0]='different question';
  expect(()=>validateVariants(input,'Maths')).toThrow();
});

it('accepts different history questions on the same topic and rejects duplicates', async () => {
  const { validateSubjectQuestions } = await import('./questionVariants.js');
  const questions = [
    ['Who was the first president of the United States? Answer with the full name.','George Washington','He commanded the Continental Army during the American Revolution.'],
    ['Which US president issued the Emancipation Proclamation in 1863? Answer with the full name.','Abraham Lincoln','He led the United States during the Civil War.'],
    ...Array.from({length:4},(_,i)=>[`History question ${i}`,`Person ${i}`,`Relevant hint ${i}`]),
  ].map(([question,full_answer,hint])=>({question,full_answer,hint}));
  expect(validateSubjectQuestions({questions}).questions[1].hint).toContain('Civil War');
  questions[1]=questions[0];
  expect(()=>validateSubjectQuestions({questions})).toThrow();
});

it('rejects different questions that resolve to the same answer', async () => {
  const maths=payload(); maths.variants[1].full_answer=maths.variants[0].full_answer;
  expect(()=>validateVariants(maths,'Maths')).toThrow();
  maths.variants[1].full_answer='2.0';
  expect(()=>validateVariants(maths,'Maths')).toThrow();
  const {validateSubjectQuestions}=await import('./questionVariants.js');
  const questions=Array.from({length:6},(_,i)=>({question:`Question ${i}`,hint:`Hint ${i}`,full_answer:'Same person'}));
  expect(()=>validateSubjectQuestions({questions})).toThrow();
});
