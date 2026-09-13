import { ApiError, bodyOf, sendError } from '../server/syllabus/teachback.js';
import { verifyIdentity, resolveSession } from '../server/auth/auth0.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    bodyOf(req, 1000);
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !/^Bearer \S+$/.test(header) || header.length > 16000) {
      throw new ApiError(401, 'Sign in with Auth0 first.');
    }
    const identity = await verifyIdentity(header.slice(7));
    return res.status(200).json(await resolveSession(identity));
  } catch (error) { return sendError(res, error); }
}
