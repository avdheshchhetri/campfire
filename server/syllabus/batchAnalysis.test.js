import { afterEach, expect, it, vi } from 'vitest';
import { analyzeBatches } from '../../src/features/syllabus/batchAnalysis.js';
afterEach(() => vi.useRealTimers());
async function* chunks() { for (let i = 0; i < 6; i++) yield i; }
it('overlaps three requests, caps concurrency, and preserves order despite out-of-order completion', async () => {
  vi.useFakeTimers();
  let active = 0; let peak = 0; const finished = [];
  const job = analyzeBatches(chunks(), async value => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, (6 - value) * 10));
    active--; return value;
  }, new AbortController(), value => finished.push(value));
  await vi.runAllTimersAsync();
  expect(await job).toEqual([0, 1, 2, 3, 4, 5]);
  expect(peak).toBe(3);
  expect(finished[0]).toBe(2);
});
it('aborts other requests on failure and returns the original error instead of partial results', async () => {
  const controller = new AbortController(); let started = 0;
  const job = analyzeBatches(chunks(), async (value, signal) => {
    started++;
    if (value === 1) throw new Error('Quota exhausted');
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    });
  }, controller, () => {});
  await expect(job).rejects.toThrow('Quota exhausted');
  expect(controller.signal.aborted).toBe(true);
  expect(started).toBeLessThanOrEqual(3);
});
it('does not send requests when already cancelled', async () => {
  const controller = new AbortController(); controller.abort();
  const send = vi.fn();
  await expect(analyzeBatches(chunks(), send, controller, () => {})).rejects.toHaveProperty('name', 'AbortError');
  expect(send).not.toHaveBeenCalled();
});
