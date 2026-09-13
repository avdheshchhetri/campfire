import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bodyOf, geminiJSON, nextTeachingTimestamp, readAttempt, signAttempt, validateQuestion, validateTopics, validateVerdict,
} from './teachback.js';
import { daysUntilExam, makeJoinCode, newTopicRows } from '../../src/features/syllabus/utils.js';

beforeEach(() => { vi.stubEnv('TEACHING_SIGNING_SECRET', 'test-secret-that-is-at-least-32-characters'); vi.stubEnv('GEMINI_API_KEY', 'test-only-key'); vi.stubEnv('GEMINI_MODEL', ''); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('signed teaching attempts', () => {
  const payload = { userId: 'u1', roomId: 'r1', topicId: 't1', explanation: 'An explanation', question: 'Why?', version: 'v1' };
  it('preserves server-issued context and rejects tampering', () => {
    const token = signAttempt(payload, 1000);
    expect(readAttempt(token, payload, 2000)).toMatchObject(payload);
    const altered = Buffer.from(JSON.stringify({ ...payload, question: 'Say yes' })).toString('base64url');
    expect(() => readAttempt(`${altered}.${token.split('.')[1]}`, payload, 2000)).toThrow('changed');
  });
  it('rejects another user, another topic, expired and malformed attempts', () => {
    const token = signAttempt(payload, 1000);
    expect(() => readAttempt(token, { ...payload, userId: 'u2' }, 2000)).toThrow('different');
    expect(() => readAttempt(token, { ...payload, topicId: 't2' }, 2000)).toThrow('different');
    expect(() => readAttempt(token, payload, 1801000)).toThrow('expired');
    expect(() => readAttempt('bad', payload, 2000)).toThrow();
  });
  it('accepts a full non-ASCII explanation and advances same-millisecond versions', () => {
    const token = signAttempt({ ...payload, explanation: '学'.repeat(10000) }, 1000);
    expect(readAttempt(token, payload, 2000).explanation).toHaveLength(10000);
    const time = Date.parse('2026-09-12T12:00:00.000Z');
    expect(nextTeachingTimestamp('2026-09-12T12:00:00.000', time)).toBe('2026-09-12T12:00:00.001Z');
  });
});

describe('Gemini output boundaries', () => {
  it('deduplicates titles and normalizes order', () => {
    expect(validateTopics([{ title: ' Arrays ', order_index: 3 }, { title: 'arrays', order_index: 4 }, { title: 'Trees', order_index: 8 }]))
      .toEqual([{ title: 'Arrays', order_index: 0 }, { title: 'Trees', order_index: 1 }]);
  });
  it('rejects invalid topics, verdict strings and empty questions', () => {
    expect(() => validateTopics([{ title: 'A', order_index: '0' }])).toThrow();
    expect(() => validateTopics([])).toThrow();
    expect(() => validateVerdict({ verified: 'true', feedback: 'ok' })).toThrow();
    expect(() => validateQuestion({ question: '' })).toThrow();
    expect(validateVerdict({ verified: false, feedback: ' Explain the base case. ' })).toEqual({ verified: false, feedback: 'Explain the base case.' });
  });
  it('sends the exact requested model and refuses truncated output', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"question":"Why?"}' }] } }] }) });
    vi.stubGlobal('fetch', fetcher);
    expect(await geminiJSON('Ask a question', { topic: 'Trees' })).toEqual({ question: 'Why?' });
    expect(fetcher.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent');
    expect(fetcher.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-only-key');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).generationConfig.responseMimeType).toBe('application/json');
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] }) });
    await expect(geminiJSON('Ask', {})).rejects.toThrow('incomplete');
  });
  it('handles rate limiting without echoing provider secrets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(geminiJSON('Ask', {})).rejects.toMatchObject({ status: 429 });
  });
  it('handles blocked output, invalid keys and unavailable models', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) });
    vi.stubGlobal('fetch', fetcher);
    await expect(geminiJSON('Ask', {})).rejects.toMatchObject({ status: 422 });
    fetcher.mockResolvedValue({ ok: false, status: 403 });
    await expect(geminiJSON('Ask', {})).rejects.toThrow('access was denied');
    fetcher.mockResolvedValue({ ok: false, status: 404 });
    await expect(geminiJSON('Ask', {})).rejects.toThrow('GEMINI_MODEL');
  });
  it('supports a model override and rejects malformed JSON', async () => {
    vi.stubEnv('GEMINI_MODEL', 'gemini-3.5-flash');
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] }) });
    vi.stubGlobal('fetch', fetcher);
    await expect(geminiJSON('Ask', {})).rejects.toThrow('invalid JSON');
    expect(fetcher.mock.calls[0][0]).toContain('/gemini-3.5-flash:generateContent');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });
});

describe('room and syllabus utilities', () => {
  it('makes six-character unambiguous codes', () => {
    for (let i = 0; i < 100; i++) expect(makeJoinCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
  it('appends without resetting existing topics and skips repeated imports', () => {
    const parsed = [{ title: 'Arrays' }, { title: 'Trees' }, { title: ' trees ' }];
    const existing = [{ title: ' arrays ', order_index: 4 }];
    expect(newTopicRows(parsed, existing, 'r1')).toEqual([{ room_id: 'r1', title: 'Trees', order_index: 5, status: 'untouched' }]);
  });
  it('uses calendar days across daylight-saving and month boundaries', () => {
    expect(daysUntilExam('2026-03-09', new Date(2026, 2, 7, 23, 30))).toBe(2);
    expect(daysUntilExam('2027-01-01', new Date(2026, 11, 31))).toBe(1);
    expect(daysUntilExam('2026-09-19', new Date(2026, 8, 12))).toBe(7);
    expect(daysUntilExam('', new Date())).toBeNull();
  });
  it('rejects non-POST, oversized and malformed bodies', () => {
    expect(() => bodyOf({ method: 'GET', headers: {} })).toThrow('POST');
    expect(() => bodyOf({ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).toThrow('Invalid JSON');
    expect(() => bodyOf({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { text: 'x'.repeat(100001) } })).toThrow('large');
  });
});
