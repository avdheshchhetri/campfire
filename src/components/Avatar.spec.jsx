import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Avatar from './Avatar';
import AvatarPicker from './AvatarPicker';
import SignIn from './SignIn';

const mocks = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signIn: mocks.signIn, error: null }) }));
vi.mock('../lib/supabaseClient', () => ({ isSupabaseConfigured: true }));
beforeEach(() => { mocks.signIn.mockReset().mockResolvedValue({}); });
afterEach(cleanup);

it('labels a preset beside its member name and gives legacy profiles a safe default', () => {
  const view = render(<Avatar avatarUrl="moon" name="Ari" />);
  expect(screen.getByRole('img', { name: "Ari's moon avatar" })).toBeTruthy();
  view.rerender(<Avatar avatarUrl="https://example.com/untrusted.png" name="Sam" />);
  expect(screen.getByRole('img', { name: "Sam's flame avatar" })).toBeTruthy();
  expect(document.querySelector('img')).toBeNull();
});

it('sends the selected preset with the profile name and disables selection during signup', async () => {
  let finish;
  mocks.signIn.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<SignIn />);
  fireEvent.change(screen.getByLabelText('What should we call you?'), { target: { value: 'Ari' } });
  fireEvent.click(screen.getByRole('button', { name: 'Book avatar' }));
  expect(screen.getByRole('button', { name: 'Book avatar' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Take a seat' }));
  expect(mocks.signIn).toHaveBeenCalledWith('Ari', 'book');
  expect(screen.getByRole('button', { name: 'Moon avatar' }).disabled).toBe(true);
  finish({});
  await waitFor(() => expect(screen.getByRole('button', { name: 'Take a seat' }).disabled).toBe(false));
});

it('exposes one selected preset and respects disabled profile settings', () => {
  const onChange = vi.fn();
  render(<AvatarPicker value="leaf" onChange={onChange} disabled />);
  const options = screen.getAllByRole('button');
  expect(options.filter(option => option.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  expect(options.every(option => option.disabled)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Moon avatar' }));
  expect(onChange).not.toHaveBeenCalled();
});
