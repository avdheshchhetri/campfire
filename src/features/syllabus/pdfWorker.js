import { splitPDF } from './pdfChunks.js';
let iterator;
let name;
self.onmessage = async ({ data }) => {
  try {
    if (data.file) {
      name = data.file.name.slice(0, 180).replace(/\.pdf$/i, '');
      iterator = splitPDF(await data.file.arrayBuffer());
    }
    const next = await iterator.next();
    if (next.done) { self.postMessage({ done: true }); return; }
    const { data: bytes, ...pages } = next.value;
    self.postMessage({ ...pages, name: `${name}-${pages.firstPage}-${pages.lastPage}.pdf`, buffer: bytes.buffer }, [bytes.buffer]);
  } catch (error) { self.postMessage({ error: error.message || 'Could not prepare this PDF.' }); }
};
