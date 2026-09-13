import Avatar from './Avatar';
import { AVATAR_OPTIONS, normalizeAvatar } from '../lib/avatars';

export default function AvatarPicker({ value, onChange, disabled = false }) {
  return <fieldset disabled={disabled}>
    <legend className="mb-3 text-sm">Choose your avatar</legend>
    <div className="flex flex-wrap gap-2">
      {AVATAR_OPTIONS.map((option) => <button key={option.id} type="button"
        className={`button ${normalizeAvatar(value) === option.id ? '' : 'button-secondary'} justify-center p-3`}
        aria-label={`${option.label} avatar`} aria-pressed={normalizeAvatar(value) === option.id}
        title={option.label} disabled={disabled} onClick={() => onChange(option.id)}>
        <Avatar avatarUrl={option.id} className="inline-flex" />
      </button>)}
    </div>
  </fieldset>;
}
