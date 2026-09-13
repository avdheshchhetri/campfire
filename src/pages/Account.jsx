import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import AccountForm from '../features/auth/AccountForm';
import Avatar, { avatars } from '../features/auth/Avatar';
import { linkGuestEmail, logoutAccount, saveAvatar, setAccountPassword } from '../features/auth/accountApi';

export default function Account() {
  const { user, profile, retryProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function run(action) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  const selected = user?.user_metadata?.avatar_key || profile?.avatar_key || 'initials';
  return <section className="panel mx-auto max-w-xl p-7 space-y-6">
    <Link to="/" className="muted">← Back to your rooms</Link>
    <h1 className="font-display text-3xl">Your account</h1>
    {!user ? <AccountForm /> : <>
      <p className="muted">{user.is_anonymous ? 'Guest profile — add an email to keep your rooms and progress across devices.' : user.email}</p>
      <fieldset disabled={busy}><legend className="mb-3 font-semibold">Choose your avatar</legend>
        <div className="avatar-options flex flex-wrap gap-3">{Object.keys(avatars).map(key => <button key={key} className="icon-button" type="button" aria-label={`${key} avatar`} aria-pressed={selected === key}
          onClick={() => run(async () => { const result = await saveAvatar(user.id, key); await retryProfile(); setMessage(result.shared ? 'Avatar saved.' : 'Avatar saved for your account. Shared avatars need the database setup file.'); })}>
          <Avatar name={profile?.display_name} avatarKey={key} className="text-xl" />
        </button>)}</div>
      </fieldset>
      {user.is_anonymous ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); const email = new FormData(event.currentTarget).get('email'); run(async () => { await linkGuestEmail(email); setMessage('Check your email to verify this address. Then return to Account to set a password. Your rooms stay on this profile.'); }); }}>
        <label>Email<input name="email" type="email" autoComplete="email" required disabled={busy} /></label>
        <button className="button" disabled={busy}>Verify email and keep my profile</button>
      </form> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const password = new FormData(form).get('password'); run(async () => { await setAccountPassword(password); form.reset(); setMessage('Password saved. You can now log in with your email and password.'); }); }}>
        <label>Set or change password<input name="password" type="password" autoComplete="new-password" required minLength={8} disabled={busy} /></label>
        <button className="button" disabled={busy}>Save password</button>
      </form>}
      {user.is_anonymous && <p className="muted text-sm">Signing out before upgrading can leave you unable to recover this guest profile. Upgrade first to keep access.</p>}
      <button className="button button-secondary" disabled={busy} onClick={() => run(async () => { await logoutAccount(); })}>Sign out on this device</button>
    </>}
    {error && <p role="alert" className="error-banner">{error}</p>}
    {message && <p role="status" className="muted">{message}</p>}
  </section>;
}
