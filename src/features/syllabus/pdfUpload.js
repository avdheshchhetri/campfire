export const MAX_PDF_BYTES = 3 * 1024 * 1024;
export const MAX_PDF_PAGES = 50;

export async function readPDF(file) {
  if (!file || !/\.pdf$/i.test(file.name)) throw new Error('Choose a PDF file.');
  if (!file.size) throw new Error('This PDF is empty. Choose another file.');
  if (file.size > MAX_PDF_BYTES) throw new Error('This PDF is larger than 3 MB. Upload a smaller syllabus or chapter.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read this file. Please select it again.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
  if (atob(data.slice(0, 12)).slice(0, 5) !== '%PDF-') throw new Error('This file is not a valid PDF.');
  return { name: file.name.slice(0, 200), data };
}
