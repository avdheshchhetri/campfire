import { bodyOf, sendError } from '../server/teachback.js';
import { challengeContext, generateGeminiChallenge } from '../server/challengeGeneration.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const context = await challengeContext(req, bodyOf(req, 5000));
    const challenge = await generateGeminiChallenge(context);
    return res.status(200).json(challenge);
  } catch (error) { return sendError(res, error); }
}
