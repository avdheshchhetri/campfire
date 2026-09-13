import Avatar from '../../features/auth/Avatar';
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useMatch, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowLeft, BookOpen, Puzzle, Flame, LayoutDashboard, LogOut, Trophy } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import { leaveRoom } from '../../features/rooms/roomsApi';
import SignIn from '../../features/auth/SignIn';
import ThemeToggle from '../theme/ThemeToggle';

export default function AppLayout() {
  const { profile, user, loading, error: authError, retryProfile } = useAuth();
  const match = useMatch('/room/:roomId/*');
  const roomId = match?.params.roomId;
  const [snapshot, setSnapshot] = useState({});
  const [revision, setRevision] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const navigate = useNavigate();
  const refreshRoom = useCallback(() => setRevision(value => value + 1), []);
  const room = snapshot.id === roomId ? snapshot.room : null;
  const activeSession = snapshot.id === roomId ? snapshot.activeSession : null;
  const roomError = snapshot.id === roomId ? snapshot.error : null;
  const roomLoading = Boolean(roomId && profile && (snapshot.id !== roomId || snapshot.loading));

  useEffect(() => {
    if (!roomId || !profile || !supabase) return;
    let cancelled = false;
    setSnapshot({ id: roomId, loading: true });
    setLeaveError('');
    async function loadRoom() {
      const [roomResult, sessionResult] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
        supabase.from('sessions').select('*').eq('room_id', roomId).eq('is_active', true).order('started_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      const error = roomResult.error || sessionResult.error;
      setSnapshot({ id: roomId, room: roomResult.data, activeSession: sessionResult.data, loading: false,
        error: error?.message || (!roomResult.data ? 'This room is unavailable. Join with its code to get access.' : null) });
    }
    loadRoom().catch(err => !cancelled && setSnapshot({ id: roomId, error: err.message, loading: false }));
    // Polling works without requiring teammates to enable Realtime publication.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadRoom().catch(() => {});
    }, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [roomId, profile, revision]);

  async function leave() {
    if (leaving) return;
    setLeaving(true); setLeaveError('');
    try { await leaveRoom(roomId, user.id); navigate('/'); }
    catch (err) { setLeaveError(err.message); }
    finally { setLeaving(false); }
  }
  const context = { room, activeSession, refreshRoom, roomLoading, roomError };

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="site-header">
        <Link to="/" className="brand" aria-label="Campfire home"><span className="brand-icon"><Flame size={25} strokeWidth={1.7} /></span>Campfire<span className="brand-period">.</span></Link>
        <span className="header-note">A little focus. A little company.</span>
        <ThemeToggle />
        {profile ? <Link to="/account" className="user-chip" aria-label="Open your account"><Avatar name={profile.display_name} avatarKey={user?.user_metadata?.avatar_key || profile.avatar_key} /><span>{profile.display_name}</span></Link> : <span className="text-sm muted">Study better, together</span>}
      </header>

      {!isSupabaseConfigured && <div className="setup-banner" role="status"><strong>Connect your study space.</strong> Add your Supabase URL and public key to <code>.env.local</code> to enable sign-in and rooms. See README for setup.</div>}
      {import.meta.env.VITE_GITHUB_PAGES === 'true' && <div className="setup-banner" role="status">This hosted preview supports rooms and focus sessions. AI analysis needs a connected server and is available in your configured local app.</div>}
      {roomId && room && <div className="room-nav">
        <div className="room-identity"><Link to="/" aria-label="Back to your rooms"><ArrowLeft size={18} /></Link><div><span className="eyebrow">STUDY ROOM</span><p>{room.name}</p></div></div>
        <nav aria-label="Room navigation"><NavLink to={`/room/${roomId}`} end><LayoutDashboard size={17} />Overview</NavLink><NavLink to={`/room/${roomId}/leaderboard`}><Trophy size={17} />Leaderboard</NavLink>{activeSession && <NavLink to={`/room/${roomId}/session/${activeSession.id}`}><Flame size={17} />Session</NavLink>}<NavLink to={`/room/${roomId}/games`}><Puzzle size={17} />Games</NavLink><NavLink to={`/room/${roomId}/flashcards`}><BookOpen size={17} />Flashcards</NavLink></nav>
        <div className="room-actions"><span className={`session-status ${activeSession ? 'live' : ''}`}><span />{activeSession ? 'Session live' : 'No active session'}</span><button className="icon-button" onClick={leave} disabled={leaving} title="Leave room" aria-label={leaving ? 'Leaving room' : 'Leave room'}><LogOut size={18} /></button></div>
      </div>}
      {leaveError && <div role="alert" className="error-banner mx-auto max-w-6xl">{leaveError}</div>}
      <main id="main-content" className="main-content">
        {loading ? <div className="empty-state" role="status">Getting your space ready…</div> : user && !profile ? <section className="panel p-5 mx-auto max-w-md"><h1 className="font-display text-2xl mb-4">Let’s finish your profile</h1><p role="alert" className="error-banner">{authError || 'Your profile could not be loaded.'}</p><button className="button mt-4" onClick={() => retryProfile().catch(() => {})}>Try again</button></section> : <Outlet context={context} />}
      </main>
      <footer className="site-footer"><span><Flame size={14} />Made for minds that grow together.</span><span>One topic at a time.</span></footer>
    </div>
  );
}

export function RequireRoom() {
  const { profile } = useAuth();
  const context = useOutletContext();
  if (!profile) return <section className="panel p-5 mx-auto max-w-md"><p className="eyebrow">YOU’RE WELCOME HERE</p><h1 className="font-display text-3xl mb-7">Join your study group</h1><SignIn /></section>;
  if (context.roomLoading) return <div className="empty-state" role="status">Opening your room…</div>;
  if (context.roomError || !context.room) return <section className="empty-state"><h1 className="font-display">We couldn’t open this room</h1><p role="alert" className="muted">{context.roomError}</p><div className="flex flex-wrap justify-center gap-3 mt-5"><button className="button button-secondary" onClick={context.refreshRoom}>Try again</button><Link className="button" to="/">Back to your rooms</Link></div></section>;
  return <Outlet context={context} />;
}
