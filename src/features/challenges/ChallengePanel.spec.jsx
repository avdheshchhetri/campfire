import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChallengePanel } from './ChallengeEngine';
afterEach(cleanup);
function setup(extra={}) {
  const challenge={id:'round',title:'Linear equations',prompt:'Solve 2x + 1 = 9.',status:'active',attempts:0,individual:true,own_solved:false,solved_count:0,...extra};
  const adapter={load:vi.fn().mockResolvedValue({challenge,players:[{user_id:'a',display_name:'Alex'},{user_id:'b',display_name:'Sam'}],clues:[{id:'hint',clue_text:'Subtract three for Sam.',order_index:1,hint_for_id:'b',hint_for_name:'Sam'}]}),subscribe:()=>()=>{},submit:vi.fn().mockResolvedValue(false),start:vi.fn(),cancel:vi.fn(),startGenerated:vi.fn()};
  render(<ChallengePanel adapter={adapter} userId="a" roomId="room" />);return adapter;
}
it('shows the question before hint controls and hides hint text until explicitly opened',async()=>{
  setup(); const question=await screen.findByText('Solve 2x + 1 = 9.');
  const reveal=screen.getByRole('button',{name:'Reveal Sam’s clue'});
  expect(question.compareDocumentPosition(reveal)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText('Subtract three for Sam.')).toBeNull();
  expect(screen.queryByRole('button',{name:'Read Sam’s clue aloud'})).toBeNull();
  expect(screen.getByRole('button',{name:'Read quiz question aloud'})).toBeTruthy();
  expect(screen.getByText('Sam’s clue')).toBeTruthy();
  fireEvent.click(reveal); expect(screen.getByText('Subtract three for Sam.')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Read Sam’s clue aloud'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Hide Sam’s clue'}));
  expect(screen.queryByText('Subtract three for Sam.')).toBeNull();
  expect(screen.queryByRole('button',{name:'Read Sam’s clue aloud'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Next quiz'})).toBeNull();
  expect(screen.queryByRole('button',{name:'End this round'})).toBeNull();
});
it('shows earned assistance without solving the question or enabling next quiz',async()=>{
  setup({failed_attempts:8,penalty_points:1,assistance_hint:'Subtract one, then divide by two.'});
  await screen.findByText('Subtract one, then divide by two.');
  expect(screen.getByLabelText('Your answer').disabled).toBe(false);
  expect(screen.queryByRole('button',{name:'Next quiz'})).toBeNull();
});
it('waits after your correct answer and enables next only when the entire round is solved',async()=>{
  setup({own_solved:true,solved_count:1});
  await screen.findByText('Solve 2x + 1 = 9.');
  expect(screen.getByLabelText('Your answer').disabled).toBe(true);
  expect(screen.queryByRole('button',{name:'Next quiz'})).toBeNull();
  cleanup(); setup({own_solved:true,solved_count:2,status:'solved'});
  expect(await screen.findByRole('button',{name:'Next quiz'})).toBeTruthy();
});
