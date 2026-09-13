import { BookOpen, Flame, Leaf, Moon, Mountain, Star } from 'lucide-react';

export const AVATAR_OPTIONS = [
  { id: 'flame', label: 'Flame', Icon: Flame },
  { id: 'leaf', label: 'Leaf', Icon: Leaf },
  { id: 'book', label: 'Book', Icon: BookOpen },
  { id: 'moon', label: 'Moon', Icon: Moon },
  { id: 'star', label: 'Star', Icon: Star },
  { id: 'mountain', label: 'Mountain', Icon: Mountain },
];

export const DEFAULT_AVATAR = 'flame';
export const isAvatar = (value) => AVATAR_OPTIONS.some((option) => option.id === value);
export const normalizeAvatar = (value) => isAvatar(value) ? value : DEFAULT_AVATAR;
