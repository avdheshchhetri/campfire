import { ApiError, adminClient, bodyOf, sendError } from '../server/syllabus/teachback.js';
import { challengeContext, generateGeminiChallenge } from '../server/challenges/challengeGeneration.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = bodyOf(req, 5000);
    const context = await challengeContext(req, body);
    const shared = body.mode === 'shared';
    const individual = body.mode === 'individual';
    if ((individual || shared) && !context.sessionId) throw new ApiError(400, 'Join a session first.');
    const challenge = await generateGeminiChallenge({ ...context, individual, shared });
    if (shared) {
      const {data, error} = await adminClient().rpc('cf_save_shared_question', {
        p_room: context.roomId, p_session: context.sessionId, p_user: context.user.id,
        p_topic: context.topicId, p_question: challenge.question, p_answer: challenge.full_answer,
      });
      if (error) {
        const code = typeof error.code === 'string' && /^[A-Z0-9]{5,12}$/.test(error.code) ? error.code : 'UNKNOWN';
        const messages = {
          PGRST202: 'The shared-question function is missing from this Supabase project or its API schema cache. Check the migration and reload the schema cache.',
          '42883': 'A required database function is missing. Check that all Campfire migrations have been applied to this Supabase project.',
          '42501': 'The server cannot access the question-saving function. Check SUPABASE_SERVICE_ROLE_KEY and its function permissions.',
          PGRST301: 'Supabase rejected the server credentials. Check SUPABASE_SERVICE_ROLE_KEY belongs to the configured Supabase project.',
          P0001: 'The session, participants, or topic changed while generating. Reopen the active session and select a current syllabus topic.',
        };
        throw new ApiError(code === 'P0001' ? 409 : 503, `${messages[code] || 'The database could not save the question. Check the database logs for this error code.'} (${code})`);
      }
      return res.status(200).json({challengeId:data});
    }
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
