import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChallengePanel } from './ChallengeEngine';
afterEach(cleanup);
function setup(extra={}) {
  const challenge={id:'round',title:'Linear equations',prompt:'Solve 2x + 1 = 9.',status:'active',attempts:0,individual:true,own_solved:false,solved_count:0,...extra};
  const adapter={load:vi.fn().mockResolvedValue({challenge,players:[{user_id:'a',display_name:'Alex'},{user_id:'b',display_name:'Sam'}],clues:[{id:'hint',clue_text:'Subtract three for Sam.',order_index:1,hint_for_id:'b',hint_for_name:'Sam'}]}),subscribe:()=>()=>{},submit:vi.fn().mockResolvedValue(false),start:vi.fn(),cancel:vi.fn(),startGenerated:vi.fn()};
  render(<ChallengePanel adapter={adapter} userId="a" roomId="room" />);return adapter;
}
it('shows a complete question with optional audio and no hint controls',async()=>{
 setup({shared_question:true});
 await screen.findByText('Solve 2x + 1 = 9.');
 expect(screen.getByRole('heading',{name:'Question'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Read quiz question aloud'})).toBeTruthy();
 expect(screen.queryByText('Subtract three for Sam.')).toBeNull();
 expect(screen.queryByRole('button',{name:/Reveal/})).toBeNull();
 expect(screen.queryByRole('button',{name:/Generate practice/})).toBeNull();
});
it('keeps the next question locked until everyone finishes',async()=>{
 setup({shared_question:true,own_solved:true,solved_count:1});
 await screen.findByText('Solve 2x + 1 = 9.');
 expect(screen.getByLabelText('Your answer').disabled).toBe(true);
 expect(screen.queryByRole('button',{name:/Generate practice/})).toBeNull();
 cleanup();setup({shared_question:true,own_solved:true,solved_count:2,status:'solved'});
 expect(await screen.findByRole('button',{name:'Generate practice question with Gemini'})).toBeTruthy();
});
it('replaces obsolete rounds explicitly and never shows their private hints',async()=>{
 setup();
 expect(await screen.findByText('Starting a new question replaces the previous round.')).toBeTruthy();
 expect(screen.queryByText('Subtract three for Sam.')).toBeNull();
});
