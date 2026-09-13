# Optional ElevenLabs tutor voice

Campfire’s teach-back AI is Gemini. ElevenLabs reads the displayed text; it does not replace Gemini, grade answers, or change verification status.

## Add your API key

1. In ElevenLabs, create an API key with text-to-speech access. Keep the key private.
2. Open `.env.local` **in the Campfire repository root**, alongside `package.json`.
3. Add this line and replace the placeholder yourself:

```dotenv
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

4. Restart `npm run dev`. The local Vite bridge serves `/api/speak`.
5. For Vercel, open **Project → Settings → Environment Variables**. Choose **Secret**, use `ELEVENLABS_API_KEY` as the name/key, and paste your API key as the value. Select your deployment environments, save, and redeploy.

Do not put this secret in Git, `config/public-supabase.json`, a React component, or a `VITE_` variable. GitHub Pages cannot host this route. Existing Supabase server URL/public-key configuration is required for authentication; this route does not need a service-role key or new migration.

## One tutor voice

Chosen voice: **Sarah**, ID `EXAVITQu4vr4xnSDxMaL`. This is the soft female premade voice listed in [ElevenLabs’ TTS examples](https://github.com/elevenlabs/skills/blob/main/text-to-speech/SKILL.md).

[Find Sarah](https://elevenlabs.io/app/voice-library?search=EXAVITQu4vr4xnSDxMaL). Add it to your account if needed. An optional server variable `ELEVENLABS_VOICE_ID` overrides the voice consistently across all calls; the client cannot choose or randomize a voice.

Model: `eleven_multilingual_v2`. The `neutral`, `encouraging`, and `concerned` presets adjust stability, style and speed while keeping the same voice. These are gentle delivery settings, not guaranteed emotion controls; the wording also influences delivery. See [ElevenLabs TTS](https://elevenlabs.io/docs/overview/capabilities/text-to-speech) and [Create speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).

## API route

Implemented in [`api/speak.js`](../api/speak.js):

```http
POST /api/speak
Content-Type: application/json
Authorization: Bearer <Supabase access token>
```

```json
{
  "roomId": "your-room-uuid",
  "text": "What makes a recursive function stop?",
  "mood": "neutral"
}
```

Successful JSON response:

```json
{ "audio": "<base64 MP3>", "mimeType": "audio/mpeg" }
```

The route validates room membership, text length (1–2,000 characters), and the mood before calling ElevenLabs. It returns no API key and sets `Cache-Control: no-store`. The provider call has a 20-second deadline; the client has a 25-second overall deadline, including sign-in lookup. Provider errors return a safe JSON error. Audio size is limited to 2 MB. There are no automatic generation retries.

Only text selected for playback is sent to ElevenLabs. Replaying the currently loaded clip uses the existing audio; leaving/changing the component discards it, so another later playback can use additional ElevenLabs credits. The app does not set the ElevenLabs account’s spending cap; configure that in the provider account if needed.

## Playback component

[`ReadAloud.jsx`](../src/features/audio/ReadAloud.jsx) is an optional sound-icon button with play/pause, preparing-audio and speaking indicators, plus a nonblocking failure/retry message. It never starts fetching on mount. The first click fetches and starts the clip; if the browser blocks playback after the fetch, it asks for another tap without regenerating audio.

```jsx
import ReadAloud from '../audio/ReadAloud.jsx';

<ReadAloud
  roomId={roomId}
  text={question}
  mood="neutral"
  label="Read follow-up question aloud"
/>
```

Changing the text or navigating away cancels the pending request and stops the old clip. Starting another tutor clip pauses the previous one. Audio state is separate from form state: no audio error calls the teach-back submission handler or blocks answer submission.

## TeachTopic integration

[`TeachTopic.jsx`](../src/features/syllabus/TeachTopic.jsx) keeps the question-generation flow unchanged. The rendered follow-up gains this adjacent control:

```diff
+ import ReadAloud from '../audio/ReadAloud.jsx';

- <p>{followup.question}</p>
+ <div className="flex items-start gap-3">
+   <p>{followup.question}</p>
+   <ReadAloud roomId={roomId} text={followup.question}
+     mood="neutral" label="Read follow-up question aloud" />
+ </div>
```

The displayed evaluation feedback also has a read-aloud button, with encouraging mood after verification and neutral mood otherwise. Neither insertion awaits audio during `submit()`.

## SessionRecap integration

There was no `SessionRecap` in this checkout. [`SessionRecap.jsx`](../src/features/focus/SessionRecap.jsx) now renders on ended-session pages through [`Session.jsx`](../src/pages/Session.jsx). Ending a session saves normally first; recap loading and audio happen afterward.

```jsx
<SessionRecap
  roomId={roomId}
  session={state.session}
  examDate={room?.exam_date}
/>
```

The recap displays one sentence built from the saved syllabus data. Its sound button is separate:

```jsx
<p>{recap.text}</p>
<ReadAloud roomId={roomId} text={recap.text}
  mood={recap.mood} label="Read session recap aloud" />
```

Mood rules:

- **Encouraging:** more than half of the syllabus topics are verified.
- **Concerned:** fewer than half are verified and the exam is within seven days of session end.
- **Neutral:** other cases, including no topics or exactly half verified.

Topics whose latest teaching timestamp falls between the session’s `started_at` and `ended_at` are described as worked on this session. Otherwise the recap describes overall saved coverage, avoiding invented activity. It uses current saved topic records, not an immutable historical session log. If the topic read fails, a generic text recap remains available. No extra Gemini request is needed.

## Validation and remaining setup

Automated tests cover route authorization, mood settings, provider errors, click-only fetching, pause/replay, stale-request cancellation, playback blocking, and recap mood/activity selection. No real ElevenLabs speech was generated during implementation because the API key is left for you to configure. After adding it, click a question’s sound icon and test playback on the actual demo device.

## Quiz questions and clues

The challenge question includes an optional sound button. Teammate clue audio is mounted only inside the revealed clue: reveal first, then click its sound button to request speech. Hiding the clue stops playback and cancels a pending request. No speech request occurs merely by revealing it, and audio failure never blocks answers or hint controls.

## Troubleshooting speech access

The speech route distinguishes rejected credentials, missing Text to Speech permissions, inaccessible voices, plan/credit restrictions, and temporary provider failures without exposing raw provider responses.

- Set `ELEVENLABS_API_KEY` as a server secret in the hosting project's environment for the deployment you use, then redeploy. Do not use a `VITE_` prefix.
- The key must allow Text to Speech. A valid key can still lack this permission.
- Set `ELEVENLABS_VOICE_ID` to the ID of one consistent voice your account can use through the API. Voice Library availability in the website does not guarantee API access on your plan. Add the selected voice to your account when required.
- A plan or credit error does not mean you must upgrade: first check whether a different voice is available through your existing plan. Campfire does not change billing or automatically buy credits.
- If an older deployment still shows the generic “Check the ElevenLabs key and voice access” message, deploy the latest commit to receive the specific error.

See [ElevenLabs error documentation](https://elevenlabs.io/docs/eleven-api/resources/errors) and [API key permissions](https://elevenlabs.io/docs/overview/administration/workspaces/api-keys).

### Switching from the previous tutor voice

Change an existing hosting `ELEVENLABS_VOICE_ID` override to `EXAVITQu4vr4xnSDxMaL` (Sarah), or remove the override to use the new code default, then redeploy. An old environment override takes precedence over the updated default. Sarah is a premade female voice, but access is account-dependent: ElevenLabs documents restrictions for newer accounts and retirement of Default voices on December 31, 2026. This change does not guarantee free API access. See [Default voice availability](https://elevenlabs.io/docs/help-center/product/voices/my-voices/how-do-i-access-eleven-labs-default-voices).
