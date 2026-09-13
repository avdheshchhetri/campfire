import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { isSupabaseConfigured } from '../lib/supabaseClient';

export default function SignIn() {
  const { signIn, error: authError } = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { await signIn(name); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <div><label htmlFor="display-name">What should we call you?</label>
        <input id="display-name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoComplete="nickname" required maxLength={60} disabled={busy} />
      </div>
      {(error || authError) && <p role="alert" className="error-banner">{error || authError}</p>}
      <button className="button w-full justify-center" disabled={!isSupabaseConfigured || busy || !name.trim()}>{busy ? 'Getting your seat…' : 'Take a seat'}<ArrowRight size={18} /></button>
      {!isSupabaseConfigured && <div className="rounded-xl bg-orange-50 p-4 text-sm text-orange-950" role="status">
        <p>Sign-in is waiting for this app’s Supabase connection. You can explore the challenge preview while it is being configured.</p>
        <a className="button button-secondary mt-3" href={`${import.meta.env.BASE_URL}challenge-demo.html`}>Explore the local demo</a>
        <p className="mt-2">Demo only: sample teammates and puzzles, with no shared data or AI calls.</p>
      </div>}
      <p className="muted text-sm">No password needed. Your guest profile stays in this browser. Clearing browser data or changing devices creates a new profile.</p>
    </form>
  );
}
