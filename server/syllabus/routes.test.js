import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), geminiJSON: vi.fn(), adminClient: vi.fn() }));
vi.mock('./teachback.js', async importOriginal => ({ ...(await importOriginal()), ...mocks }));
import parseSyllabus from '../../api/parse-syllabus.js';
import verifyTeaching from '../../api/verify-teaching.js';

const roomId = '10000000-0000-0000-0000-000000000001';
const topicId = '20000000-0000-0000-0000-000000000001';
let topic;
let writes;
let conflict;
function queryBuilder(table, admin = false) {
  let values;
  const q = {
    select: () => q, eq: () => q, is: () => q,
    update: input => { values = input; return q; },
    maybeSingle: async () => {
      if (table === 'room_members') return { data: { user_id: 'u1' }, error: null };
      if (admin && values) {
        if (conflict) return { data: null, error: null };
        writes.push(values); Object.assign(topic, values); return { data: { ...topic }, error: null };
      }
      return { data: { ...topic }, error: null };
    },
  }; return q;
}
async function invoke(handler, body) {
  const response = { statusCode: 200, body: null, setHeader: vi.fn(), status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await handler({ method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test' }, body }, response);
  return response;
}
beforeEach(() => {
  vi.resetAllMocks(); process.env.TEACHING_SIGNING_SECRET = 'test-secret-that-is-at-least-32-characters';
  topic = { id: topicId, title: 'Recursion', status: 'untouched', last_taught_at: null }; writes = []; conflict = false;
  mocks.authorize.mockResolvedValue({ user: { id: 'u1' }, client: { from: table => queryBuilder(table) } });
  mocks.adminClient.mockReturnValue({ from: table => queryBuilder(table, true) });
});

describe('parse syllabus route', () => {
  it('analyzes a validated PDF and rejects mixed inputs', async () => {
    const document = await PDFDocument.create(); document.addPage().drawText('Data structures');
    const pdf = { name: 'syllabus.pdf', data: Buffer.from(await document.save()).toString('base64') };
    mocks.geminiJSON.mockResolvedValue([{ title: 'Data structures', order_index: 0 }]);
    expect((await invoke(parseSyllabus, { roomId, pdf })).statusCode).toBe(200);
    expect(mocks.geminiJSON.mock.calls[0][3]).toMatchObject({ pages: 1, data: pdf.data });
    expect((await invoke(parseSyllabus, { roomId, pdf, text: 'also text' })).statusCode).toBe(400);
  });
  it('returns validated topics and does not write to the database', async () => {
    mocks.geminiJSON.mockResolvedValue([{ title: 'Recursion', order_index: 0 }]);
    const result = await invoke(parseSyllabus, { roomId, text: 'Unit 1: Recursion' });
    expect(result.statusCode).toBe(200); expect(result.body.topics).toHaveLength(1); expect(writes).toHaveLength(0);
  });
  it('returns a useful no-topics response and rejects malformed AI output', async () => {
    mocks.geminiJSON.mockResolvedValue([]);
    expect((await invoke(parseSyllabus, { roomId, text: 'Office hours' })).statusCode).toBe(422);
    mocks.geminiJSON.mockResolvedValue('bad');
    expect((await invoke(parseSyllabus, { roomId, text: 'Unit 1' })).statusCode).toBe(502);
  });
  it('does not call Gemini before authorization succeeds', async () => {
    mocks.authorize.mockRejectedValue(new Error('denied'));
    expect((await invoke(parseSyllabus, { roomId, text: 'Unit 1' })).statusCode).toBe(500);
    expect(mocks.geminiJSON).not.toHaveBeenCalled();
  });
});

describe('teach-back route lifecycle', () => {
  async function ask() {
    mocks.geminiJSON.mockResolvedValueOnce({ question: 'Why is a base case needed?' });
    return invoke(verifyTeaching, { roomId, topicId, stage: 'question', explanation: 'A function calls itself on smaller inputs.' });
  }
  it('marks taught, evaluates signed context, then verifies and prevents downgrades', async () => {
    const question = await ask(); expect(question.statusCode).toBe(200); expect(topic.status).toBe('taught');
    mocks.geminiJSON.mockResolvedValueOnce({ verified: true, feedback: 'You connected termination to the base case.' });
    const result = await invoke(verifyTeaching, { roomId, topicId, stage: 'evaluate', attempt: question.body.attempt, answer: 'It stops recursion.', question: 'Forged question' });
    expect(result.body.verified).toBe(true); expect(topic.status).toBe('verified');
    expect(mocks.geminiJSON.mock.calls[1][1].question).toBe('Why is a base case needed?');
    expect((await ask()).statusCode).toBe(409); expect(writes).toHaveLength(2);
  });
  it('leaves an unsuccessful answer taught and consumes that attempt', async () => {
    const question = await ask();
    mocks.geminiJSON.mockResolvedValueOnce({ verified: false, feedback: 'Explain how the recursion stops.' });
    const input = { roomId, topicId, stage: 'evaluate', attempt: question.body.attempt, answer: 'It makes things faster.' };
    expect((await invoke(verifyTeaching, input)).body.verified).toBe(false); expect(topic.status).toBe('taught');
    expect((await invoke(verifyTeaching, input)).statusCode).toBe(409);
  });
  it('does not mark taught when AI output is invalid', async () => {
    mocks.geminiJSON.mockResolvedValueOnce({ question: '' });
    const result = await invoke(verifyTeaching, { roomId, topicId, stage: 'question', explanation: 'Something' });
    expect(result.statusCode).toBe(502); expect(writes).toHaveLength(0);
  });
  it('returns a conflict if a teammate updates during the AI call', async () => {
    conflict = true; const result = await ask(); expect(result.statusCode).toBe(409); expect(writes).toHaveLength(0);
  });
});
