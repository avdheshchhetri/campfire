import { useState } from 'react';
import { loginAccount, registerAccount } from './accountApi';
import { isSupabaseConfigured } from '../../lib/supabaseClient';

export default function AccountForm() {
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'login') await loginAccount(data.get('email'), data.get('password'));
      else {
        const result = await registerAccount(data.get('name'), data.get('email'), data.get('password'));
        if (!result.session) setMessage('Check your email to confirm your account, then log in.');
      }
      form.reset();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5">
    <div className="segmented" role="group" aria-label="Account action">
      <button type="button" disabled={busy} aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError(''); setMessage(''); }}>Log in</button>
      <button type="button" disabled={busy} aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setError(''); setMessage(''); }}>Create account</button>
    </div>
    <form onSubmit={submit} className="space-y-5">
      {mode === 'register' && <label>Your name<input name="name" autoComplete="nickname" required maxLength={60} disabled={busy} /></label>}
      <label>Email<input name="email" type="email" autoComplete="email" required disabled={busy} /></label>
      <label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} required disabled={busy} /></label>
      {mode === 'register' && <p className="muted text-sm">Use at least 8 characters. Your project may require a stronger password.</p>}
      {error && <p className="error-banner" role="alert">{error}</p>}
      {message && <p className="muted" role="status">{message}</p>}
      <button className="button w-full" disabled={busy || !isSupabaseConfigured}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in to Campfire' : 'Create my account'}</button>
    </form>
  </section>;
}
