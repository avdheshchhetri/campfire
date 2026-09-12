import type { ChallengeAdapter, Snapshot } from './types';
export const demoPlayers = ['Alex', 'Maya', 'Jordan'].map((display_name, i) => ({ user_id: `demo-${i}`, display_name }));
export const demoClues = [
  'The three resistors are connected in series. Their resistances add together to give the total resistance.',
  'The resistors have values of 2 Ω, 4 Ω, and 6 Ω. The battery supplies 24 volts.',
  'Ohm’s law: current I = voltage V ÷ resistance R. Give your answer in amperes (A).',
];
export function isDemoAnswer(answer: string) { return /^2(?:\.0+)?\s*(?:a|amps?|amperes?)?$/i.test(answer.trim()); }
export function createDemoAdapter(getPlayer: () => number): ChallengeAdapter {
  let challenge: Snapshot['challenge'] = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(fn => fn());
  return {
    async load() { return { challenge: challenge && { ...challenge }, players: demoPlayers, clues: challenge ? [{ id: String(getPlayer()), clue_text: demoClues[getPlayer()], order_index: getPlayer() }] : [] }; },
    async start() { challenge = { id: crypto.randomUUID(), title: 'Complete the circuit', prompt: 'A circuit contains three resistors and one battery. Work together to calculate the current flowing through the circuit.', status: 'active', attempts: 0, created_at: new Date().toISOString() }; emit(); },
    async submit(answer) { if (!challenge || challenge.status !== 'active') throw new Error('Start an active challenge first.'); challenge.attempts++; const correct = isDemoAnswer(answer); if (correct) challenge.status = 'solved'; emit(); return correct; },
    async cancel() { if (challenge) challenge.status = 'cancelled'; emit(); },
    subscribe(refresh, status) { listeners.add(refresh); status(true); return () => { listeners.delete(refresh); }; },
  };
}
