import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock.js';

Object.defineProperty(navigator, 'wakeLock', { configurable: true, get: () => undefined });

afterEach(() => { vi.restoreAllMocks(); });
function sentinel() {
  const value = new EventTarget();
  value.release = vi.fn(async () => value.dispatchEvent(new Event('release')));
  return value;
}
it('keeps an active session awake, reacquires on return, and releases on end', async () => {
  const first = sentinel(), second = sentinel();
  const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  vi.spyOn(navigator, 'wakeLock', 'get').mockReturnValue({ request });
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const { result, rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } });
  await waitFor(() => expect(result.current.status).toBe('active'));
  expect(request).toHaveBeenCalledWith('screen');
  act(() => { hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange')); });
  expect(first.release).toHaveBeenCalledOnce();
  act(() => { hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange')); });
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  rerender({ active: false });
  expect(second.release).toHaveBeenCalledOnce();
});
it('reports rejection without breaking focus and supports retry', async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error('Battery saver')).mockResolvedValueOnce(sentinel());
  vi.spyOn(navigator, 'wakeLock', 'get').mockReturnValue({ request });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const { result } = renderHook(() => useWakeLock(true));
  await waitFor(() => expect(result.current.status).toBe('unavailable'));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe('active'));
});
it('releases a pending request if the session ends before it resolves', async () => {
  let resolve;
  const request = vi.fn(() => new Promise(done => { resolve = done; }));
  vi.spyOn(navigator, 'wakeLock', 'get').mockReturnValue({ request });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const { unmount } = renderHook(() => useWakeLock(true));
  unmount();
  const lock = sentinel();
  await act(async () => resolve(lock));
  expect(lock.release).toHaveBeenCalledOnce();
});
