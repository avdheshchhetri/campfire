# Turn on real AI in Campfire

## What works now

The implementation supports a syllabus PDF (up to 3 MB/50 pages), syllabus text, and AI teach-back. **The localhost syllabus demo is intentionally simulated.** It does not call Gemini or write to your Supabase project. Adding an API key alone does not switch that demo to live mode.

## What you and your team need to do

1. **Use the real Campfire app.** Your team must provide login, the configured `src/supabaseClient.js`, user profiles, the supplied shared database schema, and the access policies described in `syllabus-teachback-handoff.md`. Mount `SyllabusTracker` from `src/features/syllabus` in that app. The demo configuration aliases Supabase to fake data, so do not use it for the live application.
2. **Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).** Check the model access and quota available to your Google project. You do not need to train or fine-tune anything. Do not paste the API key into chat, GitHub, or frontend code.
3. **Put the key in Vercel → your Campfire project → Settings → Environment Variables.** Name it `GEMINI_API_KEY`, paste the key as its value, and enable the environments where you need it. Save and redeploy. For local live development, put the same settings in a `.env.local` file in the repository root; that file is ignored by Git. Configure these server values:

   ```dotenv
   GEMINI_API_KEY=your-gemini-api-key
   GEMINI_MODEL=gemini-2.5-flash
   SUPABASE_URL=your-project-url
   SUPABASE_ANON_KEY=your-project-publishable-or-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
   TEACHING_SIGNING_SECRET=a-random-secret-at-least-32-characters-long
   ```

   `GEMINI_MODEL` is optional and defaults to `gemini-2.5-flash`; choose a compatible text/PDF Gemini model available to your project. The Supabase settings must point to the same project as the host browser client. The service-role key and signing secret stay on the server. Do not prefix server secrets with `VITE_`. Your team's existing client controls its own browser configuration.
4. **Run the server routes.** Use `vercel dev` with the real host app, or deploy that app on Vercel and redeploy after changing environment variables. The normal Vite dev server cannot execute `/api` functions. This repository's default entry is still the separate challenge demo until your team mounts the real tracker.
5. **Test while signed in.** Create/join a room, choose Add syllabus → Upload PDF, select a small readable syllabus, and select Analyze PDF. Review and save topics. Teach one topic and answer the follow-up. Confirm status changes for another room member and that direct browser edits cannot mark topics verified.

## How the AI works

```text
Syllabus PDF/text → authenticated server route → Gemini 2.5 Flash
                 → suggested topics → your review → Supabase topic rows

Your explanation → server → Gemini asks one follow-up → topic becomes taught
Your answer + signed attempt → server → Gemini evaluates → verified or taught
```

For PDF input, Gemini receives the actual PDF document, including page visuals. The server checks the file before sending it. Readable scanned pages are supported, but unreadable scans cannot be reliably interpreted. An upload is a request for analysis, not training a new model.

The application keeps the saved topic titles and progress. It does not retain the PDF or build a searchable textbook library. Teach-back is assessed from the topic title and the learner's explanation/answer; it does not fetch the original textbook. Whole-textbook question grounding for the collaborative challenge engine is a separate feature still to build.

## If something fails

| Message | What to check |
| --- | --- |
| Local demo / live setup required | You are running the simulated entry, not the host app |
| Sign in / join this room | Host auth session, profile row, room membership, and RLS |
| Missing server configuration | Vercel environment names, correct environment, and redeployment |
| API did not return JSON | `/api` routes are not running; use Vercel or `vercel dev` |
| AI service unavailable | Gemini API key, project quota/billing, model access, provider health |
| PDF too large / too many pages | Split to 3 MB and 50 pages or fewer |
| Password-protected PDF | Export an unlocked copy |
| AI timed out | Try a shorter section or a smaller PDF |

Reference: [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key), [available models](https://ai.google.dev/gemini-api/docs/models), [PDF support](https://ai.google.dev/gemini-api/docs/document-processing).
