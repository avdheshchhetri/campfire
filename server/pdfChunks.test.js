import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { splitPDF } from '../src/features/syllabus/pdfChunks.js';
async function collect(bytes, options) {
  const chunks = [];
  for await (const chunk of splitPDF(bytes, options)) chunks.push(chunk);
  return chunks;
}
it('preserves every page in order and respects the batch page limit', async () => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 7; i++) pdf.addPage([200 + i, 300]);
  const chunks = await collect(await pdf.save(), { maxPages: 3 });
  expect(chunks.map(c => [c.firstPage, c.lastPage])).toEqual([[1, 3], [4, 6], [7, 7]]);
  const widths = [];
  for (const chunk of chunks) {
    expect(chunk.totalPages).toBe(7);
    const part = await PDFDocument.load(chunk.data);
    widths.push(...part.getPages().map(p => p.getWidth()));
  }
  expect(widths).toEqual([200, 201, 202, 203, 204, 205, 206]);
});
it('splits on actual encoded size and never silently drops an oversized page', async () => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 20; i++) pdf.addPage().drawText('Page '+i);
  const bytes = await pdf.save();
  const chunks = await collect(bytes, { maxBytes: 1800 });
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.every(c => c.data.length <= 1800)).toBe(true);
  expect(chunks.at(-1).lastPage).toBe(20);
  await expect(collect(bytes, { maxBytes: 10 })).rejects.toThrow('Page 1 alone');
});
it('rejects invalid documents', async () => {
  await expect(collect(new TextEncoder().encode('not PDF'))).rejects.toThrow('could not be opened');
});
