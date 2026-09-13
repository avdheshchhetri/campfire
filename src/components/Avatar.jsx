import { AVATAR_OPTIONS, normalizeAvatar } from '../lib/avatars';

export default function Avatar({ avatarUrl, name, className = 'avatar' }) {
  const { Icon, label } = AVATAR_OPTIONS.find((option) => option.id === normalizeAvatar(avatarUrl));
  return <span className={className} role="img" aria-label={name ? `${name}'s ${label.toLowerCase()} avatar` : `${label} avatar`}>
    <Icon size={22} aria-hidden="true" />
  </span>;
}
