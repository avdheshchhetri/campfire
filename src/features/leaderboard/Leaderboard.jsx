import Avatar from '../auth/Avatar';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ArrowRight, Check, Leaf, RefreshCw, Users } from 'lucide-react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { memberInitials, prepareLeaderboard } from './leaderboardModel.js';

const initialState = { roomId: null, rows: [], status: 'loading', error: '' };

export default function Leaderboard() {
  const { roomId } = useParams();
  const { room } = useOutletContext();
  const [state, setState] = useState(initialState);
  const [sort, setSort] = useState('progress');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    setState((previous) => ({
      roomId,
      rows: previous.roomId === roomId ? previous.rows : [],
      status: previous.roomId === roomId && previous.status === 'ready' ? 'refreshing' : 'loading',
      error: '',
    }));

    async function load() {
      try {
        if (!supabase) throw new Error('Connect Supabase to load your group’s progress.');
        const result = await supabase
          .from('leaderboard')
          .select('room_id, user_id, display_name, verified_count, total_topics')
          .eq('room_id', roomId)
          .order('verified_count', { ascending: false })
          .order('display_name', { ascending: true });
        if (!current) return;
        if (result.error) throw result.error;
        let rows = result.data ?? [];

        // The schema's view uses an inner join to syllabus_topics, so a room
        // without topics returns no rows. Keep its members visible at zero.
        if (rows.length === 0) {
          const members = await supabase
            .from('room_members')
            .select('user_id, profiles!room_members_user_id_fkey(*)')
            .eq('room_id', roomId);
          if (!current) return;
          if (members.error) throw members.error;
          rows = (members.data ?? []).map((member) => {
            const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
            return {
              room_id: roomId,
              user_id: member.user_id,
              display_name: profile?.display_name || 'Member',
              avatar_key: profile?.avatar_key,
              verified_count: 0,
              total_topics: 0,
            };
          });
        }
        try {
          const profiles = await supabase.from('profiles').select('*').in('id', rows.map(row => row.user_id));
          if (!profiles.error) rows = rows.map(row => ({ ...row, avatar_key: profiles.data?.find(profile => profile.id === row.user_id)?.avatar_key }));
        } catch { /* Initials remain available if avatar enrichment is unavailable. */ }
        if (current) setState({ roomId, rows, status: 'ready', error: '' });
      } catch (error) {
        if (current) {
          setState((previous) => ({
            ...previous,
            roomId,
            status: 'error',
            error: error.message || 'We couldn’t load the leaderboard. Please try again.',
          }));
        }
      }
    }
    load();
    return () => { current = false; };
  }, [roomId, revision]);

  // Do not flash another room's results before the effect clears its state.
  const rows = useMemo(
    () => prepareLeaderboard(state.roomId === roomId ? state.rows : [], sort),
    [state.roomId, state.rows, roomId, sort],
  );
  const isLoading = state.status === 'loading' || state.roomId !== roomId;
  const isRefreshing = state.status === 'refreshing';
  const totalTopics = rows[0]?.total_topics ?? 0;
  const verifiedCount = rows[0]?.verified_count ?? 0;
  const progress = rows[0]?.progress ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">A LITTLE FURTHER, TOGETHER</p>
          <h1 className="font-display page-heading mt-3">The leaderboard</h1>
          <p className="muted mt-3 max-w-xl leading-relaxed">
            Small steps add up. See how far {room?.name || 'your group'} has come.
          </p>
        </div>
        <button
          className="button button-secondary gap-2"
          type="button"
          onClick={() => setRevision((value) => value + 1)}
          disabled={isLoading || isRefreshing}
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true" />
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {state.error && state.roomId === roomId && (
        <div className="error-banner flex flex-wrap items-center justify-between gap-3" role="alert">
          <p>{state.error}</p>
          <button className="button button-secondary" type="button" onClick={() => setRevision((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="panel px-8 py-16 text-center" role="status" aria-live="polite">
          <RefreshCw size={24} className="mx-auto mb-4 animate-spin text-accent dark:text-orange-700" aria-hidden="true" />
          <p className="muted">Gathering your group’s progress…</p>
        </div>
      ) : rows.length > 0 ? (
        <>
          <section className="overflow-hidden rounded-[1.75rem] border border-border dark:border-[#dfddc9] bg-surface dark:bg-[#e9ecdF] p-6 sm:p-8" aria-labelledby="shared-progress-heading">
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
              <div className="max-w-lg">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface dark:bg-[#f7f8ed] text-muted dark:text-[#667147]">
                  <Leaf size={20} aria-hidden="true" />
                </div>
                <h2 id="shared-progress-heading" className="font-display text-2xl font-semibold tracking-tight">Shared room progress</h2>
                <p className="mt-2 text-sm leading-6 text-muted dark:text-[#626b52]">
                  Every verified topic is a win for the whole room. Each member shares the same progress.
                </p>
              </div>
              <div className="shrink-0 sm:text-right">
                <p className="text-5xl font-medium tracking-tight text-primary dark:text-[#3e4a30]">{Math.round(progress)}<span className="ml-1 text-2xl">%</span></p>
                <p className="mt-2 text-sm text-muted dark:text-[#626b52]">{verifiedCount} of {totalTopics} topics verified</p>
              </div>
            </div>
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-surface dark:bg-[#d5dac4]" aria-hidden="true">
              <div className="h-full rounded-full bg-success dark:bg-[#74835a] transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
          </section>

          {totalTopics === 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border dark:border-[#d8ccbb] px-5 py-4">
              <p className="muted text-sm">No topics yet. Your group’s journey begins with the first one.</p>
              <Link to={`/room/${roomId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-accent dark:text-[#ad502f]">
                Go to room <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          )}

          <section className="panel overflow-hidden" aria-labelledby="members-heading" aria-busy={isRefreshing}>
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border dark:border-[#ece6db] px-6 py-5 sm:px-8">
              <h2 id="members-heading" className="font-display flex items-center gap-3 text-lg font-semibold">
                Your study circle
                <span className="rounded-full bg-surface dark:bg-[#f2eee5] px-2.5 py-1 text-xs font-medium text-muted dark:text-[#797368]">{rows.length}</span>
              </h2>
              <label className="flex items-center gap-2 text-sm text-muted dark:text-[#797368]">
                <ArrowDownUp size={14} aria-hidden="true" />
                <span className="sr-only">Sort members</span>
                <select
                  className="cursor-pointer rounded-lg border border-border dark:border-[#e1dace] bg-transparent py-2 pl-2 pr-7 text-sm text-primary dark:text-[#60584d]"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="progress">Most progress</option>
                  <option value="name-asc">Name: A–Z</option>
                  <option value="name-desc">Name: Z–A</option>
                </select>
              </label>
            </div>

            <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_minmax(10rem,1fr)_4rem] gap-4 px-8 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted dark:text-[#999184] sm:grid" aria-hidden="true">
              <span>Rank</span><span>Member</span><span>Topics verified</span><span className="text-right">Progress</span>
            </div>
            <ol className="divide-y divide-[#f0ebe2] px-6 sm:px-8">
              {rows.map((member) => (
                <li key={member.user_id} className="grid grid-cols-[2rem_minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-4 py-6 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(10rem,1fr)_4rem] sm:gap-4">
                  <span className="text-sm font-medium tabular-nums text-muted dark:text-[#a99e8b]" aria-label={`Rank ${member.rank}`}>
                    {String(member.rank).padStart(2, '0')}
                  </span>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border dark:border-[#e7d6c2] bg-surface dark:bg-[#f1e7d7] text-xs font-semibold text-muted dark:text-[#826e50]" aria-hidden="true">
                      <Avatar name={member.display_name} avatarKey={member.avatar_key} className="text-lg" />
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold">{member.display_name}</p>
                      <p className="mt-1 text-xs text-muted dark:text-[#968b7b]">Growing together</p>
                    </div>
                  </div>
                  <div className="col-start-2 row-start-2 sm:col-start-auto sm:row-start-auto">
                    <div className="mb-2 flex items-center gap-1 text-xs text-muted dark:text-[#857968]">
                      {member.verified_count === member.total_topics && member.total_topics > 0 && <Check size={12} aria-hidden="true" />}
                      {member.verified_count} / {member.total_topics} topics
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-surface dark:bg-[#f1e9dc]"
                      role="progressbar"
                      aria-label={`${member.display_name}’s shared room progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(member.progress)}
                      aria-valuetext={`${member.verified_count} of ${member.total_topics} topics verified`}
                    >
                      <div className="h-full rounded-full bg-accent dark:bg-[#c97d51] transition-[width] duration-500" style={{ width: `${member.progress}%` }} />
                    </div>
                  </div>
                  <span className="col-start-3 row-start-1 text-right text-sm font-medium tabular-nums text-muted dark:text-[#9b6848] sm:col-start-auto sm:row-start-auto">{Math.round(member.progress)}%</span>
                </li>
              ))}
            </ol>
            <p className="border-t border-border dark:border-[#ece6db] px-6 py-4 text-xs leading-5 text-muted dark:text-[#8d8170] sm:px-8">
              Members with equal progress share a rank. This board reflects your room’s collective progress.
            </p>
          </section>
        </>
      ) : state.status !== 'error' ? (
        <div className="panel empty-state px-6 py-16 text-center">
          <Users size={30} className="mx-auto mb-4 text-accent dark:text-[#b58b63]" aria-hidden="true" />
          <h2 className="font-display text-xl font-semibold">Your circle starts here</h2>
          <p className="muted mx-auto mt-3 max-w-sm text-sm leading-6">No members are available yet. Head to your room to get your study group together.</p>
          <Link className="button button-secondary mt-6 inline-flex gap-2" to={`/room/${roomId}`}>Back to room <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      ) : null}
    </div>
  );
}
