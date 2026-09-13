import type { ChallengeAdapter, ChallengeEngineProps, Snapshot } from './types';
export function createSupabaseAdapter({ client, roomId, sessionId }: ChallengeEngineProps): ChallengeAdapter {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  async function post(path: string, body: Record<string, unknown>) {
    if (import.meta.env.VITE_GITHUB_PAGES === 'true') throw new Error('Gemini needs a server. Use the configured local app; GitHub Pages supports practice puzzles only.');
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new Error('Sign in before generating a challenge.');
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
    });
    let result;
    try { result = await response.json(); }
    catch { throw new Error('The challenge API is unavailable. Run the app with its serverless API routes.'); }
    if (!response.ok) throw new Error(result.error || 'Could not generate the challenge.');
    return result;
  }
  let pending: { key: string; challenge: unknown } | null = null;
  return {
    async load(): Promise<Snapshot> {
      const snapshot: Snapshot = await rpc('cf_snapshot', { p_room: roomId, p_session: sessionId });
      try {
        const { data, error } = await client.from('room_members')
          .select('user_id, profiles!room_members_user_id_fkey(display_name, avatar_url)')
          .eq('room_id', roomId);
        if (error) return snapshot;
        const profiles = new Map((data ?? []).map(member => [member.user_id,
          Array.isArray(member.profiles) ? member.profiles[0] : member.profiles]));
        return { ...snapshot, players: snapshot.players.map(player => ({
          ...player, avatar_url: profiles.get(player.user_id)?.avatar_url ?? player.avatar_url,
        })) };
      } catch {
        // Optional profile details must not interrupt an active puzzle.
        return snapshot;
      }
    },
    async start() { await rpc('cf_start', { p_room: roomId, p_session: sessionId }); },
    async startGenerated(input) {
      const body = { roomId, sessionId, ...input };
      const key = JSON.stringify(body);
      // Retry a failed save without paying for another generation.
      if (pending?.key !== key) pending = { key, challenge: await post('/api/generate-challenge-gemini', body) };
      await post('/api/save-challenge', { ...body, challenge: pending.challenge });
      pending = null;
    },
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
