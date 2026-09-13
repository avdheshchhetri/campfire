import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FocusClockProvider, useSessionClock } from './FocusClockProvider';
const mocks = vi.hoisted(() => ({ watch: vi.fn(), stop: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'test-user' } }) }));
vi.mock('./campfireApi', () => ({ watchSession: mocks.watch }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));
const participants = [{user_id:'one'}];
function Clock() { const { elapsed } = useSessionClock('test-session', participants); return <output>{elapsed}</output>; }
afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });
it('keeps monitoring between views, pauses when a phone flips, and restores the same elapsed time', () => {
  vi.useFakeTimers(); let now = 0; vi.spyOn(performance, 'now').mockImplementation(() => now);
  let callbacks;
  mocks.watch.mockImplementation((id, next) => { callbacks = next; return mocks.stop; });
  const page = render(<FocusClockProvider><Clock /></FocusClockProvider>);
  act(() => { callbacks.onSnapshot({is_active:true},[{user_id:'one',state:'down'}]); callbacks.onOnline(new Set(['one'])); callbacks.onStatus('ready'); now=2000; vi.advanceTimersByTime(250); });
  expect(screen.getByRole('status').textContent).toBe('2000');
  page.rerender(<FocusClockProvider><p>Another page</p></FocusClockProvider>);
  act(() => { now=5000; callbacks.onSnapshot({is_active:true},[{user_id:'one',state:'up'}]); });
  page.rerender(<FocusClockProvider><Clock /></FocusClockProvider>);
  expect(screen.getByRole('status').textContent).toBe('5000');
  expect(mocks.watch).toHaveBeenCalledTimes(1);
  expect(mocks.stop).not.toHaveBeenCalled();
  act(() => { now=9000; vi.advanceTimersByTime(250); });
  expect(screen.getByRole('status').textContent).toBe('5000');
});
