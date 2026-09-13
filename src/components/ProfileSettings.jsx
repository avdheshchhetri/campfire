import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import AvatarPicker from './AvatarPicker.jsx';

export default function ProfileSettings() {
  const { profile, updateAvatar } = useAuth();
  if (!profile) return null;
  return <details className="panel p-5 mb-5"><summary>Profile settings</summary>
    <AvatarForm key={`${profile.id}:${profile.avatar_url}`} profile={profile} save={updateAvatar} />
  </details>;
}

function AvatarForm({ profile, save }) {
  const [value, setValue] = useState(profile.avatar_url || 'flame');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { await save(value); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4 mt-4">
    <AvatarPicker value={value} onChange={setValue} disabled={busy} />
    <button className="button" disabled={busy || value === profile.avatar_url}>{busy ? 'Saving avatar…' : 'Save avatar'}</button>
    {error && <p className="error-banner" role="alert">{error}</p>}
  </form>;
}
