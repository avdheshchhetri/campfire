import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StartChallenge } from './StartChallenge';
afterEach(cleanup);
const topics = [{ id: 'one', title: 'Recursion' }, { id: 'two', title: 'Sorting' }];
it('sends the selected topic and room subject only when Gemini is clicked', async () => {
  const onGenerate = vi.fn().mockResolvedValue();
  render(<StartChallenge subject="CS" topics={topics} busy={false} onGenerate={onGenerate} />);
  expect(onGenerate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Syllabus topic'), { target: { value: 'two' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate practice question with Gemini' }));
  await waitFor(() => expect(onGenerate).toHaveBeenCalledWith({ subject: 'CS', topicTitle: 'Sorting' }));
});
it('requires a topic and ignores duplicate clicks during generation', async () => {
  let finish;
  const onGenerate = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<StartChallenge subject="CS" topics={[]} busy={false} onGenerate={onGenerate} />);
  expect(screen.getByRole('button').disabled).toBe(true);
  view.rerender(<StartChallenge subject="CS" topics={topics} busy={false} onGenerate={onGenerate} />);
  fireEvent.click(screen.getByRole('button')); fireEvent.click(screen.getByRole('button'));
  expect(onGenerate).toHaveBeenCalledTimes(1);
  finish();
});
