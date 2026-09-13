import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {StudyMinigames} from './StudyMinigames';
afterEach(cleanup);
it('requires syllabus topics and keeps games optional',()=>{
 render(<StudyMinigames topics={[]}/>);
 expect(screen.getByRole('button',{name:'Topic pairs'}).disabled).toBe(true);
 expect(screen.getByRole('button',{name:'Topic scramble'}).disabled).toBe(true);
});
it('checks topic answers and prevents repeat scoring',()=>{
 render(<StudyMinigames topics={[{id:'a',title:'Recursion'}]}/>);
 fireEvent.click(screen.getByRole('button',{name:'Topic scramble'}));
 fireEvent.change(screen.getByLabelText('Topic name'),{target:{value:'recursion'}});
 fireEvent.click(screen.getByRole('button',{name:'Check topic'}));
 expect(screen.getByRole('status').textContent).toContain('1 solved');
 expect(screen.getByRole('button',{name:'Check topic'}).disabled).toBe(true);
});
it('reveals syllabus cards and resets a game',()=>{
 render(<StudyMinigames topics={[{id:'a',title:'Recursion'},{id:'b',title:'Sorting'}]}/>);
 fireEvent.click(screen.getByRole('button',{name:'Topic pairs'}));
 expect(screen.getAllByRole('button',{name:/Reveal card/})).toHaveLength(4);
 fireEvent.click(screen.getByRole('button',{name:'Reveal card 1'}));
 expect(screen.getAllByRole('button',{name:/Reveal card/})).toHaveLength(3);
 fireEvent.click(screen.getByRole('button',{name:'Restart pairs'}));
 expect(screen.getAllByRole('button',{name:/Reveal card/})).toHaveLength(4);
});
