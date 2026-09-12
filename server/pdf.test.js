import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validatePDF } from './pdf.js';
import { geminiJSON } from './teachback.js';

async function makePDF(pages = 1, encrypted = false) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage().drawText('Unit 1: Arrays and linked lists');
  if (encrypted) pdf.context.trailerInfo.Encrypt = pdf.context.register(pdf.context.obj({ Filter: 'Standard' }));
  return { name: 'syllabus.pdf', data: Buffer.from(await pdf.save()).toString('base64') };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('PDF upload validation', () => {
  it('validates a real PDF and counts its pages', async () => {
    const result = await validatePDF(await makePDF(2)); expect(result.pages).toBe(2);
  });
  it('rejects oversized, malformed and renamed files', async () => {
    await expect(validatePDF({ name: 'a.pdf', data: 'A'.repeat(4194308) })).rejects.toMatchObject({ status: 413 });
    await expect(validatePDF({ name: 'a.pdf', data: Buffer.from('not a pdf').toString('base64') })).rejects.toMatchObject({ status: 400 });
    await expect(validatePDF({ name: 'a.txt', data: 'AAAA' })).rejects.toThrow();
    await expect(validatePDF({ name: 'a.pdf', data: '%%%=' })).rejects.toThrow();
    await expect(validatePDF({ name: 'a.pdf', data: Buffer.from('%PDF-1.7\nbroken').toString('base64') })).rejects.toMatchObject({ status: 422 });
  });
  it('rejects more than 50 pages and encrypted documents', async () => {
    await expect(validatePDF(await makePDF(51))).rejects.toThrow('1–50');
    await expect(validatePDF(await makePDF(1, true))).rejects.toThrow('Password-protected');
  });
  it('sends a native PDF document to Gemini with the correct MIME type', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-only');
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '[]' }] } }] }) });
    vi.stubGlobal('fetch', fetcher);
    const pdf = await validatePDF(await makePDF());
    await geminiJSON('Extract topics', { task: 'Read this PDF' }, 6000, pdf);
    const content = JSON.parse(fetcher.mock.calls[0][1].body).contents[0].parts;
    expect(content[0]).toEqual({ inlineData: { mimeType: 'application/pdf', data: pdf.data } });
    expect(content[1].text).toContain('Read this PDF');
  });
});
