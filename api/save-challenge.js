import { ApiError, adminClient, bodyOf, sendError } from '../server/teachback.js';
import { challengeContext, validateChallenge } from '../server/challengeGeneration.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = bodyOf(req, 15000);
    const context = await challengeContext(req, body);
    if (!context.sessionId) throw new ApiError(400, 'Session ID is required to save a challenge.');
    const challenge = validateChallenge(body.challenge, 400);
    const { data, error } = await adminClient().rpc('cf_save_generated', {
      p_room: context.roomId, p_session: context.sessionId, p_user: context.user.id,
      p_topic: context.topicId, p_challenge: challenge,
    });
    if (error) throw new ApiError(error.code === 'P0001' ? 409 : 503,
      error.code === 'P0001' ? 'The session or roster changed. Refresh and try again.' : 'Could not save the challenge. Check the challenge migration and retry.');
    return res.status(200).json({ challengeId: data });
  } catch (error) { return sendError(res, error); }
}
