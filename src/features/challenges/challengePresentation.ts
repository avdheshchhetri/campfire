import type { Snapshot } from './types';

// Older generated rounds embedded the common question in each clue instead of
// the public prompt. Recover that text without exposing the private hint itself.
export function presentChallenge(snapshot: Snapshot): Snapshot {
  if (!snapshot.challenge || snapshot.challenge.individual) return snapshot;
  let prompt = snapshot.challenge.prompt;
  if (/^combine your partial clues/i.test(prompt)) {
    const common = snapshot.clues.map(clue => clue.clue_text.match(/Common Question:\s*([\s\S]*?)(?=\n\n(?:Hint|Your clue):|$)/i)?.[1]?.trim()).find(Boolean);
    prompt = common || 'This older round did not store a separate question. Start a new individual quiz below to receive a complete question.';
  }
  // A practice bundle retains all required information, with one card per holder
  // rather than presenting six internal puzzle slots as six player assignments.
  const clues = snapshot.clues.length > 1 && snapshot.clues.every(clue => !clue.hint_for_id && !clue.hint_for_name && !/^Hint for /i.test(clue.clue_text)) ? [{ ...snapshot.clues[0], clue_text: snapshot.clues.map((clue, index) => `Part ${index + 1}:\n${clue.clue_text}`).join('\n\n') }] : snapshot.clues;
  return { ...snapshot, challenge: { ...snapshot.challenge, prompt }, clues };
}
