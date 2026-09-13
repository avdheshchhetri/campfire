import { readPDF, MAX_PDF_BYTES } from './pdfUpload.js';
import { callStudyAPI } from './api.js';
import { analyzeBatches } from './batchAnalysis.js';
import { retryAnalysis } from './retryAnalysis.js';
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export async function analyzePDF(file, roomId, onProgress, signal) {
  if (!file || !/\.pdf$/i.test(file.name)) throw new Error('Choose a PDF file.');
  if (!file.size) throw new Error('This PDF is empty.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Choose a PDF of 200 MB or smaller.');
  // Keep the lightweight path for small files; a page-limit response uses batching.
  if (file.size <= MAX_PDF_BYTES) {
    try {
      onProgress('Analyzing PDF…');
      const pdf = await readPDF(file);
      return await retryAnalysis(() => callStudyAPI('/api/parse-syllabus', { roomId, pdf }, { signal }), { signal, onRetry: attempt => onProgress(`Gemini is temporarily busy. Retrying PDF (${attempt}/2)…`) });
    } catch (error) {
      if (error.status !== 422 || !error.message.includes('1–50')) throw error;
    }
  }
  onProgress('Preparing PDF pages… Large books may take several minutes.');
  const worker = new Worker(new URL('./pdfWorker.js', import.meta.url), { type: 'module' });
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const jobSignal = controller.signal;
  async function* chunks() {
    let request = { file };
    while (true) {
      jobSignal.throwIfAborted();
      const chunk = await new Promise((resolve, reject) => {
        const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
        const cleanup = () => { jobSignal.removeEventListener('abort', abort); worker.onmessage = null; worker.onerror = null; };
        worker.onmessage = ({ data }) => { cleanup(); data.error ? reject(new Error(data.error)) : resolve(data); };
        worker.onerror = () => { cleanup(); reject(new Error('Could not prepare this PDF. Try a smaller chapter or use a desktop browser.')); };
        jobSignal.addEventListener('abort', abort, { once: true });
        worker.postMessage(request);
      });
      if (chunk.done) break;
      yield chunk;
      request = { next: true };
    }
  }
  let completedPages = 0;
  try {
    const batches = await analyzeBatches(chunks(), async (chunk, batchSignal) => {
      const bytes = new Uint8Array(chunk.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      let result;
      try { result = await retryAnalysis(() => callStudyAPI('/api/parse-syllabus', { roomId, pdf: { name: chunk.name, data: btoa(binary) } }, { signal: batchSignal }), { signal: batchSignal, onRetry: attempt => onProgress(`Retrying pages ${chunk.firstPage}–${chunk.lastPage} (${attempt}/2). Completed batches are kept…`) }); }
      catch (error) {
        // Administrative/title-only batches need not prevent processing the rest.
        if (error.status === 422 && error.message.startsWith('No study topics')) result = { topics: [] };
        else throw error;
      }
      return result.topics;
    }, controller, chunk => {
      completedPages += chunk.lastPage - chunk.firstPage + 1;
      onProgress(`Analyzed ${completedPages} of ${chunk.totalPages} pages · up to 3 batches at once…`);
    });
    const topics = [];
    const seen = new Set();
    for (const topic of batches.flat()) {
      const key = topic.title.trim().replace(/\s+/g, ' ').toLowerCase();
      if (!seen.has(key)) { seen.add(key); topics.push({ title: topic.title, order_index: topics.length }); }
    }
    if (!topics.length) throw new Error('No study topics were found in this PDF.');
    return { topics };
  } finally {
    controller.abort();
    signal?.removeEventListener('abort', abort);
    worker.terminate();
  }
}
