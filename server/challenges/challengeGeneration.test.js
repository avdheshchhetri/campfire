import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateGeminiChallenge, validateChallenge } from './challengeGeneration.js';

const puzzle = { full_answer: '42', clues: [
  { clue_text: 'Find x. It is an even integer greater than 40.', order_index: 0 },
  { clue_text: 'Find x. It is less than 44.', order_index: 1 },
] };
beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'server-only-test-key');
  vi.stubEnv('GEMINI_CHALLENGE_MODEL', 'gemini-3.8-flash');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(puzzle) }] } }] }) }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Gemini challenge generation', () => {
  it('uses the server key header, pinned model, and exact JSON schema', async () => {
    expect(await generateGeminiChallenge({ subject: 'CS', topicTitle: 'Recursion' })).toEqual(puzzle);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain('/gemini-3.8-flash:generateContent');
    expect(url).not.toContain('server-only-test-key');
    expect(options.headers['x-goog-api-key']).toBe('server-only-test-key');
    const request = JSON.parse(options.body);
    expect(request.generationConfig.responseFormat.text.schema.required).toEqual(['full_answer', 'clues']);
    expect(request.contents[0].parts[0].text).toBe(JSON.stringify({ subject: 'CS', topicTitle: 'Recursion' }));
    expect(request.systemInstruction.parts[0].text).toContain('Medicine');
    expect(request.systemInstruction.parts[0].text).toContain('design or creative');
  });
  it.each([401, 403, 404, 429, 500])('sanitizes provider failure %i', async status => {
    fetch.mockResolvedValue({ ok: false, status });
    await expect(generateGeminiChallenge({ subject: 'CS', topicTitle: 'Loops' })).rejects.toMatchObject({ status: status === 429 ? 429 : status === 500 ? 502 : 503 });
  });
  it.each(['MAX_TOKENS', 'SAFETY'])('rejects incomplete or blocked output: %s', async reason => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ finishReason: reason }] }) });
    await expect(generateGeminiChallenge({ subject: 'CS', topicTitle: 'Loops' })).rejects.toHaveProperty('status', reason === 'SAFETY' ? 422 : 502);
  });
  it('rejects invalid JSON and missing configuration without leaking secrets', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not JSON' }] } }] }) });
    await expect(generateGeminiChallenge({ subject: 'CS', topicTitle: 'Loops' })).rejects.toHaveProperty('status', 502);
    vi.stubEnv('GEMINI_API_KEY', ''); fetch.mockClear();
    await expect(generateGeminiChallenge({ subject: 'CS', topicTitle: 'Loops' })).rejects.toHaveProperty('status', 503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('validates clue count, unique text, indexes and short answers', () => {
    for (const invalid of [null, {}, { ...puzzle, full_answer: 'x'.repeat(161) },
      { ...puzzle, clues: puzzle.clues.slice(0, 1) },
      { ...puzzle, clues: [...puzzle.clues].reverse() },
      { ...puzzle, clues: [puzzle.clues[0], { ...puzzle.clues[0], order_index: 1 }] },
      { ...puzzle, extra: true }]) expect(() => validateChallenge(invalid)).toThrow();
  });
});
