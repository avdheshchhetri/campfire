import { ApiError, adminClient, bodyOf, sendError } from '../server/syllabus/teachback.js';
import { challengeContext, generateGeminiChallenge } from '../server/challenges/challengeGeneration.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = bodyOf(req, 5000);
    const context = await challengeContext(req, body);
    const individual = body.mode === 'individual';
    if (individual && !context.sessionId) throw new ApiError(400, 'Join a session first.');
    const challenge = await generateGeminiChallenge({ ...context, individual });
    if (individual) {
      const { data, error } = await adminClient().rpc('cf_save_individual', {
        p_room: context.roomId, p_session: context.sessionId, p_user: context.user.id,
        p_topic: context.topicId, p_questions: challenge.questions,
      });
      if (error) throw new ApiError(503, 'Could not save individual questions. Apply the individual-question migration and retry.');
      return res.status(200).json({ challengeId: data });
    }
    return res.status(200).json(challenge);
  } catch (error) { return sendError(res, error); }
}
