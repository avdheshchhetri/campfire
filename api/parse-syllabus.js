import { authorize, bodyOf, geminiJSON, sendError, text, uuid, validateTopics } from '../server/syllabus/teachback.js';
import { ApiError } from '../server/syllabus/teachback.js';
import { validatePDF } from '../server/syllabus/pdf.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // 3 MB binary becomes about 4.2 MB base64, below Vercel's 4.5 MB limit.
    const body = bodyOf(req, 4300000);
    const roomId = uuid(body.roomId, 'Room ID');
    if (body.pdf && body.text !== undefined) throw new ApiError(400, 'Send either syllabus text or one PDF, not both.');
    await authorize(req, roomId);
    const pdf = body.pdf ? await validatePDF(body.pdf) : null;
    const syllabus = pdf ? null : text(body.text, 'Syllabus', 50000);
    const raw = await geminiJSON(
      'Extract distinct teachable topics from the supplied syllabus text or PDF in their original sequence. For a textbook chapter, identify the concepts covered in that chapter. Read document text, tables, and visible page content. Ignore administrative details, grading rules, book lists, and dates. Do not invent subject matter or topics from unreadable pages. Return ONLY a JSON array of objects with exactly {"title": string, "order_index": integer}. Use concise titles and contiguous zero-based order_index values. Maximum 100 topics. Return [] if no readable study topics are present.',
      pdf ? { task: 'Identify study topics from the attached PDF.', pages: pdf.pages } : { syllabus }, 6000, pdf,
    );
    if (Array.isArray(raw) && !raw.length) return res.status(422).json({ error: 'No study topics were found. Paste the subject content of your syllabus.' });
    return res.status(200).json({ topics: validateTopics(raw) });
  } catch (error) { return sendError(res, error); }
}
