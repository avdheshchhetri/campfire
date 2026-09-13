import { PDFDocument } from 'pdf-lib';
import { ApiError } from './teachback.js';
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from '../../src/features/syllabus/pdfUpload.js';

export async function validatePDF(value) {
  if (!value || typeof value.name !== 'string' || !/\.pdf$/i.test(value.name) || value.name.length > 200 || typeof value.data !== 'string') {
    throw new ApiError(400, 'Supply a PDF filename and base64 document.');
  }
  if (value.data.length > Math.ceil(MAX_PDF_BYTES / 3) * 4) throw new ApiError(413, 'PDFs must be 3 MB or smaller.');
  if (!value.data.length || value.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) {
    throw new ApiError(400, 'Invalid PDF encoding. Select the file again.');
  }
  const bytes = Buffer.from(value.data, 'base64');
  if (bytes.length > MAX_PDF_BYTES) throw new ApiError(413, 'PDFs must be 3 MB or smaller.');
  if (bytes.toString('base64') !== value.data || bytes.subarray(0, 5).toString() !== '%PDF-') throw new ApiError(400, 'This file is not a valid PDF.');
  let pages;
  try {
    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    pages = document.getPageCount();
  }
  catch (error) {
    throw new ApiError(422, /encrypt/i.test(error.message)
      ? 'Password-protected PDFs are not supported. Upload an unlocked copy.'
      : 'This PDF could not be opened. Try exporting it again.');
  }
  if (!pages || pages > MAX_PDF_PAGES) throw new ApiError(422, 'Upload a PDF containing 1–50 pages. Split larger documents into chapters.');
  return { name: value.name, data: value.data, pages };
}
