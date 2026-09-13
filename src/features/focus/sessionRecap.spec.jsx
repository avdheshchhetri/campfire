import { expect,it } from 'vitest';
import { buildSessionRecap } from './sessionRecap';
const session={started_at:'2026-09-13T10:00:00',ended_at:'2026-09-13T11:00:00'};
it('uses encouraging mood for majority verified and only claims session work inside its timestamps',()=>{
 const recap=buildSessionRecap([{title:'Recursion',status:'verified',last_taught_at:'2026-09-13T10:30:00'},{title:'Sorting',status:'verified',last_taught_at:'2026-09-12T10:00:00'},{title:'Trees',status:'untouched'}],session,'2026-09-14');
 expect(recap.mood).toBe('encouraging');expect(recap.text).toContain('worked on Recursion this session');expect(recap.text).not.toContain('worked on Sorting');expect(recap.text).toContain('Trees still needs work');
});
it('uses concerned only for a close exam with low coverage, otherwise neutral',()=>{
 const topics=[{title:'Trees',status:'untouched'}];
 expect(buildSessionRecap(topics,session,'2026-09-14').mood).toBe('concerned');
 expect(buildSessionRecap(topics,session,'2026-12-01').mood).toBe('neutral');
 expect(buildSessionRecap([],session,null).text).toContain('add syllabus topics');
});
