import auth0Session from '../../api/auth0-session.js';
import roomStudy from '../../api/room-study.js';
import { loadEnv } from 'vite';
import speak from '../../api/speak.js';
import parseSyllabus from '../../api/parse-syllabus.js';
import verifyTeaching from '../../api/verify-teaching.js';
import generateChallenge from '../../api/generate-challenge-gemini.js';
import saveChallenge from '../../api/save-challenge.js';

const routes = {
  '/api/auth0-session': auth0Session,
  '/api/room-study': roomStudy,
  '/api/speak': speak,
  '/api/parse-syllabus': parseSyllabus,
  '/api/verify-teaching': verifyTeaching,
  '/api/generate-challenge-gemini': generateChallenge,
  '/api/save-challenge': saveChallenge,
};

// Run the same authenticated handlers locally that Vercel runs in production.
export function localApi() {
  return {
    name: 'campfire-local-api',
    apply: 'serve',
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir, '');
      for (const key of ['AUTH0_DOMAIN', 'AUTH0_AUDIENCE', 'AUTH0_CLIENT_ID', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
        'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_CHALLENGE_MODEL', 'TEACHING_SIGNING_SECRET']) {
        if (!process.env[key] && env[key]) process.env[key] = env[key];
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0];
        const handler = routes[path];
        if (!path?.startsWith('/api/')) return next();
        res.status = code => { res.statusCode = code; return res; };
        res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
        res.setHeader('Cache-Control', 'no-store');
        if (!handler) return res.status(404).json({ error: 'API route not found.' });
        try {
          let size = 0;
          const chunks = [];
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 4500000) return res.status(413).json({ error: 'Request is too large.' });
            chunks.push(chunk);
          }
          req.body = Buffer.concat(chunks).toString('utf8');
          await handler(req, res);
        } catch {
          if (!res.writableEnded) res.status(500).json({ error: 'The local API could not complete this request.' });
        }
      });
    },
  };
}
