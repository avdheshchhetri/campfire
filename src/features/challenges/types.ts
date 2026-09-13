import type { SupabaseClient } from '@supabase/supabase-js';
export type Player = { user_id: string; display_name: string; avatar_key?: string };
export type Challenge = { id: string; title: string; prompt: string; status: string; attempts: number; created_at: string; shared_question?: boolean; individual?: boolean; own_solved?: boolean; solved_count?: number; failed_attempts?: number; penalty_points?: number; assistance_hint?: string | null };
export type Clue = { id: string; clue_text: string; order_index: number; hint_for_id?: string; hint_for_name?: string };
export type Snapshot = { challenge: Challenge | null; clues: Clue[]; players: Player[] };
export type GeneratedChallengeInput = { subject: string; topicTitle: string };
export type ChallengeAdapter = {
  load(): Promise<Snapshot>;
  start(): Promise<void>;
  startGenerated?(input: GeneratedChallengeInput): Promise<void>;
  submit(answer: string): Promise<boolean>;
  cancel(): Promise<void>;
  subscribe(refresh: () => void, status: (connected: boolean) => void): () => void;
};
export type ChallengeEngineProps = { client: SupabaseClient; roomId: string; sessionId: string; userId: string; roomName?: string; subject?: string; topics?: { id: string; title: string }[] };
