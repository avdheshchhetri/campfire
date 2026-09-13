export const avatars = { initials: null, flame: '🔥', fox: '🦊', owl: '🦉', rocket: '🚀', leaf: '🌿', star: '⭐' };
export default function Avatar({ name = '', avatarKey = 'initials', className = 'avatar small' }: { name?: string; avatarKey?: string; className?: string }) {
  return <span className={className} aria-hidden="true">{avatars[avatarKey as keyof typeof avatars] || name.trim().slice(0, 1).toUpperCase() || '?'}</span>;
}
