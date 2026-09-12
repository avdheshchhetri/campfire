import type { ChallengeAdapter, ChallengeEngineProps, Snapshot } from './types';
export function createSupabaseAdapter({ client, roomId, sessionId }: ChallengeEngineProps): ChallengeAdapter {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  return {
    async load(): Promise<Snapshot> { return await rpc('cf_snapshot', { p_room: roomId, p_session: sessionId }); },
    async start() { await rpc('cf_start', { p_room: roomId, p_session: sessionId }); },
    async submit(answer) { return await rpc('cf_submit', { p_room: roomId, p_session: sessionId, p_answer: answer }); },
    async cancel() { await rpc('cf_cancel', { p_room: roomId, p_session: sessionId }); },
    subscribe(refresh, status) {
      const channel = client.channel(`challenge:${sessionId}:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `session_id=eq.${sessionId}` }, refresh)
        .subscribe(state => { status(state === 'SUBSCRIBED'); if (state === 'SUBSCRIBED') refresh(); });
      // Polling also handles reconnects, roster changes and missed realtime events.
      const timer = window.setInterval(refresh, 5000);
      return () => { clearInterval(timer); void client.removeChannel(channel); };
    },
  };
}
