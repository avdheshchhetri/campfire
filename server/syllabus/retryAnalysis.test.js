import { afterEach, expect, it, vi } from 'vitest';
import { retryAnalysis } from '../../src/features/syllabus/retryAnalysis.js';
afterEach(() => vi.useRealTimers());
it('recovers from temporary provider errors with bounded retries', async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockRejectedValueOnce({ status: 502 }).mockRejectedValueOnce({ status: 429 }).mockResolvedValue({ topics: [] });
  const result = retryAnalysis(request);
  await vi.runAllTimersAsync();
  expect(await result).toEqual({ topics: [] }); expect(request).toHaveBeenCalledTimes(3);
});
it('does not retry invalid documents or missing credentials', async () => {
  const request = vi.fn().mockRejectedValue({ status: 422 });
  await expect(retryAnalysis(request)).rejects.toEqual({ status: 422 });
  expect(request).toHaveBeenCalledTimes(1);
});
it('stops after three failed attempts', async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockRejectedValue({ status: 502 });
  const check = expect(retryAnalysis(request)).rejects.toEqual({ status: 502 });
  await vi.runAllTimersAsync(); await check;
  expect(request).toHaveBeenCalledTimes(3);
});
it('cancels during backoff without another provider request', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const request = vi.fn().mockRejectedValue({ status: 502 });
  const check = expect(retryAnalysis(request, { signal: controller.signal, onRetry: () => setTimeout(() => controller.abort(), 1) })).rejects.toHaveProperty('name', 'AbortError');
  await vi.runAllTimersAsync(); await check;
  expect(request).toHaveBeenCalledTimes(1);
});
