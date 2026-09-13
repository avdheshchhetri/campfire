import { PDFDocument } from 'pdf-lib';

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const MAX_UPLOAD_PAGES = 1000;
export const BATCH_BYTES = 3 * 1024 * 1024;

// Preserve original PDF page content; never silently remove pages or downsample scans.
export async function* splitPDF(bytes, { maxBytes = BATCH_BYTES, maxPages = 50 } = {}) {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error('Choose a PDF of 200 MB or smaller.');
  let source;
  try { source = await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (error) { throw new Error(/encrypt/i.test(error.message)
    ? 'Upload an unlocked PDF; password-protected files are not supported.'
    : 'This PDF could not be opened. Try exporting it again.'); }
  const total = source.getPageCount();
  if (!total || total > MAX_UPLOAD_PAGES) throw new Error('Choose a PDF with 1–1,000 pages. Split longer books into volumes.');
  async function* range(start, end) {
    const part = await PDFDocument.create();
    const pages = await part.copyPages(source, Array.from({ length: end - start }, (_, i) => start + i));
    pages.forEach(page => part.addPage(page));
    const data = await part.save({ useObjectStreams: true });
    if (data.byteLength <= maxBytes) { yield { data, firstPage: start + 1, lastPage: end, totalPages: total }; return; }
    if (end - start === 1) throw new Error(`Page ${start + 1} alone exceeds 3 MB. Export that page with smaller images, then retry. No topics have been saved.`);
    const middle = start + Math.floor((end - start) / 2);
    yield* range(start, middle);
    yield* range(middle, end);
  }
  for (let start = 0; start < total; start += maxPages) yield* range(start, Math.min(start + maxPages, total));
}
