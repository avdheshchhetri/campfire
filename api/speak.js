import { ApiError, authorize, bodyOf, requiredEnv, sendError, text, uuid } from '../server/syllabus/teachback.js';

// Sarah. One consistent tutor voice, overridable server-side.
export const TUTOR_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';
export const MOODS = {
  neutral: { stability: 0.65, similarity_boost: 0.75, style: 0.1, speed: 1.0, use_speaker_boost: true },
  encouraging: { stability: 0.5, similarity_boost: 0.75, style: 0.25, speed: 1.03, use_speaker_boost: true },
  concerned: { stability: 0.75, similarity_boost: 0.75, style: 0.15, speed: 0.93, use_speaker_boost: true },
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = bodyOf(req, 12000);
    const roomId = uuid(body.roomId, 'Room ID');
    const spokenText = text(body.text, 'Speech text', 2000);
    const mood = body.mood ?? 'neutral';
    if (!Object.hasOwn(MOODS, mood)) throw new ApiError(400, 'Choose neutral, encouraging, or concerned.');
    await authorize(req, roomId);
    const key = requiredEnv('ELEVENLABS_API_KEY').trim();
    const voice = process.env.ELEVENLABS_VOICE_ID?.trim() || TUTOR_VOICE_ID;
    if (!/^[a-zA-Z0-9]{20}$/.test(voice)) throw new ApiError(503, 'Check the server tutor voice ID.');
    let response;
    try {
      response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', 'xi-api-key': key },
        body: JSON.stringify({ text: spokenText, model_id: 'eleven_multilingual_v2', voice_settings: MOODS[mood] }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw await voiceError(response);
      if (!(response.headers.get('content-type') || '').startsWith('audio/')) throw new ApiError(502, 'Voice returned an invalid audio response.');
      const audio = Buffer.from(await response.arrayBuffer());
      if (!audio.length || audio.length > 2 * 1024 * 1024) throw new ApiError(502, 'Voice returned an invalid audio size.');
      return res.status(200).json({ audio: audio.toString('base64'), mimeType: 'audio/mpeg' });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(504, 'Voice took too long or is unavailable. You can keep reading the text.');
    }
  } catch (error) { return sendError(res, error); }
}

// Translate provider codes, never echo provider messages, credentials or request text.
async function voiceError(response) {
  let detail;
  try { detail = (await response.json())?.detail; } catch { /* Non-JSON provider error. */ }
  const code = detail?.code || detail?.status || detail?.type;
  if (['paid_plan_required', 'subscription_required', 'feature_not_available'].includes(code))
    return new ApiError(503, 'This tutor voice is not available on your ElevenLabs plan. Set ELEVENLABS_VOICE_ID to a voice your account can use through the API, then redeploy.');
  if (['quota_exceeded', 'payment_required', 'insufficient_credits'].includes(code) || response.status === 402)
    return new ApiError(503, 'ElevenLabs reports a credit or plan limit. Check your ElevenLabs usage; text remains available.');
  if (code === 'voice_not_found' || response.status === 404)
    return new ApiError(503, 'ElevenLabs cannot access the selected tutor voice. Check ELEVENLABS_VOICE_ID and add that voice to your ElevenLabs account, then redeploy.');
  if (['missing_permissions', 'insufficient_permissions', 'authorization_error'].includes(code) || response.status === 403)
    return new ApiError(503, 'ElevenLabs denied access. Check that the server API key allows Text to Speech and access to the selected voice.');
  if (['invalid_api_key', 'authentication_error'].includes(code) || response.status === 401)
    return new ApiError(503, 'ElevenLabs rejected the API key. Update the server ELEVENLABS_API_KEY for this deployment and redeploy.');
  if (response.status === 429)
    return new ApiError(429, 'ElevenLabs is rate-limiting speech. Wait briefly and retry; text remains available.');
  return new ApiError(503, `ElevenLabs returned HTTP ${response.status}. Speech is temporarily unavailable; text remains available.`);
}
