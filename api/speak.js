import { ApiError, authorize, bodyOf, requiredEnv, sendError, text, uuid } from '../server/syllabus/teachback.js';

// Talia — Warm Soft Guide. One consistent tutor voice, overridable server-side.
export const TUTOR_VOICE_ID = 'OZ0L6eISlOejga3XjDFt';
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
    const key = requiredEnv('ELEVENLABS_API_KEY');
    const voice = process.env.ELEVENLABS_VOICE_ID || TUTOR_VOICE_ID;
    if (!/^[a-zA-Z0-9]{20}$/.test(voice)) throw new ApiError(503, 'Check the server tutor voice ID.');
    let response;
    try {
      response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', 'xi-api-key': key },
        body: JSON.stringify({ text: spokenText, model_id: 'eleven_multilingual_v2', voice_settings: MOODS[mood] }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new ApiError(response.status === 429 ? 429 : 503,
        response.status === 429 ? 'Voice quota is busy or exhausted. The text is still available.' : 'Voice is unavailable. Check the ElevenLabs key and voice access.');
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
