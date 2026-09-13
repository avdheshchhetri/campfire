# Room Games and Flashcards

These are additive room tabs. They reuse `room-nav`/`NavLink`, `feature-grid`, `feature-card`, `panel`, `button`, existing typography utilities, and the `read-aloud` audio control. No stylesheet, theme token, font, or existing screen design changes are needed. The existing session challenge engine, focus timer, teach-back behavior, and leaderboard scoring remain separate.

## Setup

1. Apply all existing migrations through `20260913000600_shared_questions.sql` first.
2. Run the entire [007 migration](../supabase/migrations/20260913000700_room_games.sql) in **Supabase → SQL Editor → New query → Run**. Run this migration once; stop on errors. Then apply migration 008 for game controls. It creates the new tables, permissions, and game functions.
3. Deploy the frontend and `/api/room-study` route together. The local Vite API middleware also registers this route. GitHub Pages alone cannot generate AI content or speech.
4. Reuse the existing server `GEMINI_API_KEY`, Supabase server configuration, and optional `ELEVENLABS_API_KEY`/`ELEVENLABS_VOICE_ID`. No new provider keys are introduced.
5. Teach or verify a syllabus topic before starting games. Flashcards can use any saved topic.

## Games

There is one active room game at a time. Every room member at creation belongs to the fixed game roster. Late joiners can watch and join the next game. All games are independent of a focus session.

- **Spark Round:** five Gemini questions, four choices each, one correct answer, no answer timer. Each member may submit once. The answer is revealed when everyone votes or a participant selects End question and reveal answer.
- **Two Truths, One Lie:** five rounds of three statements, exactly one false. Members have up to 40 seconds for discussion and voting. The reveal explains why the false statement is wrong.
- **The Ember Riddle:** three or four progressively specific clues from one taught/verified topic. The next clue appears every 15 seconds. First correct guess wins; after the final clue's time expires the answer is shown. Matching ignores case, punctuation and spacing, and accepts a single-character edit for terms of at least six characters. Guesses have a three-second per-user cooldown. Next Riddle creates a fresh game.

Spark and Two Truths award one game point per correct vote. No answer before the deadline means no point. Spark reveals wait for Next question; Two Truths reveals last eight seconds before the next round; after round five the final scoreboard stays visible. Riddles award one game point to the winner. These points never change the study leaderboard or syllabus verification.

Database time controls deadlines, vote acceptance and phase transitions. Realtime on `challenges` tells viewers to refresh after votes/reveals; 1.5-second polling recovers missed events and requests due transitions. Any viewer can trigger a due transition, but cannot advance early. A database lock serializes votes, guesses and transitions. No always-running scheduler is required. When every viewer closes the tab, the current deadline still expires; the next viewer processes that expiry, with later rounds starting when observed rather than silently skipping the whole game.

## Riddle narration

Click **Enable narration** once per game. Revealed clues then use the existing **`/api/speak`** handler with `{roomId, clueId, mood: 'neutral'}`. The handler checks membership, room ownership and revealed status before reading the clue. It uses the same Sarah voice/configuration and synthesis code as teach-back. The browser cannot substitute arbitrary text into a cached clue request.

Audio is cached in `challenge_clues.audio_url` as a bounded MP3 **data URL**, so no additional Storage bucket or public upload policy is needed. Cached requests do not call ElevenLabs again. Round snapshots return only cache availability, not the audio data on every poll. A short database lease prevents simultaneous viewers from generating the same audio; another caller receives `202 {pending: true}` and retries. An expired lease permits recovery after a failed generation. Each clue is limited by the existing speech size and time limits.

The player reuses the app's sound button, speaking indicator and pause behavior. Failure or slow audio never blocks reading, guessing, or advancing. Browsers may block autoplay until an interaction; use the sound button when prompted. Everyone receives the same revealed clue and cached clip, but playback is not sample-synchronized across devices and network delays can differ. No hidden clue is narrated. Stopping narration or moving to the next clue pauses the current clip. Existing `{roomId,text,mood}` speech calls retain their response contract.

## Flashcards

Choose one topic or Whole syllabus, then Generate Flashcards. Whole-syllabus generation runs sequential batches of one topic, saving each successful batch. If a later batch fails, prior cards remain; select the remaining topics to retry without regenerating completed batches. Generation requests approximately two cards per topic; repeated generation adds another set.

Cards are shared within the room and can be reviewed at any time, without an active game or focus session. Click the card to flip, use Previous/Next, or Shuffle. The back is hidden until flipped; moving to a different card resets it to the front. Review position/shuffle order is local to the open page and does not affect other members.

The shared schema stores topic titles rather than full lesson documents. Generation uses available topic `content`/`description` if present, otherwise the title and room subject. AI-generated facts still need review.

## Security and schema

The migration adds `audio_url`, `game_rounds`, `game_answers`, and `flashcards` as requested, plus explanation and uniqueness constraints and private game state/audio leases. `challenges.type` is a text column without a restrictive enum in this repository; the save function validates `trivia`, `mystery_voice`, and `two_truths` explicitly. `split_puzzle` behavior is unchanged.

- Correct option indexes/explanations remain in answer-bearing tables with no direct browser read access. Checked snapshots expose them only during reveal/completion.
- Clients submit only an option index; the database supplies user identity, correctness, and timing. The unique round/user pair prevents changing or duplicating a vote.
- Room-wide clues use `assigned_to = NULL`. Only revealed clues are readable by members of their challenge's room. Existing assigned-clue restrictions remain intact.
- Riddle topic answers stay in private game state. The public challenge does not identify the secret topic before the answer reveal.
- Flashcards have room-member read access and server-only generation writes.
- The generator uses the existing `geminiJSON` helper, schema-constrained output, and validation. Generation and speech require authenticated room membership.

## Main files

- `api/room-study.js`: game/flashcard generation and persistence.
- `server/games/generation.js`: existing Gemini helper integration, schemas, validation.
- `src/pages/Games.jsx`: game cards and scoreboard.
- `src/features/games/SparkRound.jsx`, `TwoTruthsOneLie.jsx`, `ChoiceGame.jsx`: timed voting/reveals.
- `src/features/games/EmberRiddle.jsx`: guessing and cached narration.
- `src/features/games/useRoomGame.js`: Realtime subscription, polling, server clock offset.
- `src/pages/Flashcards.jsx`, `src/features/games/FlipCard.jsx`: generation and review.
- `api/speak.js`: additive revealed-clue caching branch; no second TTS integration.

## Verification

Automated tests cover complete five-round play, vote idempotency, early-answer privacy, revealed room-wide clues, first-correct riddle completion, fuzzy matching, flashcard read/write permissions, and existing app regressions. Hosted multi-device Realtime and actual Gemini/ElevenLabs generation require configured deployment credentials and the migration; mocked-provider tests do not verify account quota or voice access.

Any original participant can choose End game for everyone, confirm, and close the current game with scores retained. Spark deadlines are ignored by vote validation; the review stays open until Next question. Two Truths and riddles keep their existing timers. Migration 008 is required for these controls.
