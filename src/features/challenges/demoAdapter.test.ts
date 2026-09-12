import { describe, expect, it } from 'vitest';
import { createDemoAdapter, isDemoAnswer } from './demoAdapter';
describe('challenge flow', () => {
 it('assigns different clues, counts attempts, solves and restarts', async () => {
   let player=0; const api=createDemoAdapter(()=>player);
   expect((await api.load()).challenge).toBeNull();
   await api.start(); const first=(await api.load()).clues[0].clue_text;
   player=1; expect((await api.load()).clues[0].clue_text).not.toBe(first);
   expect(await api.submit('4')).toBe(false);
   expect((await api.load()).challenge?.status).toBe('active');
   expect(await api.submit('2 A')).toBe(true);
   expect((await api.load()).challenge).toMatchObject({status:'solved',attempts:2});
   await expect(api.submit('2')).rejects.toThrow();
   const previousId=(await api.load()).challenge?.id;
   await api.start(); expect((await api.load()).challenge?.attempts).toBe(0);
   expect((await api.load()).challenge?.id).not.toBe(previousId);
   await api.cancel(); expect((await api.load()).challenge?.status).toBe('cancelled');
 });
 it('accepts units but rejects accidental substring matches', () => {
   for(const value of ['2',' 2 A ','2.0 amperes']) expect(isDemoAnswer(value)).toBe(true);
   for(const value of ['12','2 bananas','2.1','']) expect(isDemoAnswer(value)).toBe(false);
 });
 it('notifies subscribers and cleans up', async () => {
   const api=createDemoAdapter(()=>0); let calls=0;
   const stop=api.subscribe(()=>calls++,()=>{}); await api.start(); expect(calls).toBe(1);
   stop(); await api.cancel(); expect(calls).toBe(1);
 });
});
