import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import Avatar from '../auth/Avatar';
import type { Clue, Player } from './types';

export function TeammateHints({ clues, players, userId }: { clues: Clue[]; players: Player[]; userId: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return <div className="cf-hints">{clues.map((clue, index) => {
    const owner = players.find(person => person.user_id === clue.hint_for_id);
    const name = clue.hint_for_name || clue.clue_text.match(/^Hint for ([^\n]+)/)?.[1];
    const label = clue.hint_for_id === userId ? 'Your solo hint' : name ? `Hint for ${name}` : `Teammate hint ${index + 1}`;
    const expanded = Boolean(open[clue.id]);
    return <section className="cf-clue-card" key={clue.id}>
      <div className="cf-hint-owner">{name ? <Avatar name={name} avatarKey={owner?.avatar_key} className="cf-hint-avatar" /> : <LockKeyhole size={22} aria-hidden="true" />}<strong>{label}</strong></div>
      <button className="cf-text-button" aria-expanded={expanded} aria-controls={`hint-${clue.id}`}
        onClick={() => setOpen(previous => ({ ...previous, [clue.id]: !expanded }))}>{expanded ? 'Hide' : 'Reveal'} {label.toLowerCase()}</button>
      {expanded && <p id={`hint-${clue.id}`} className="cf-hint-content">{clue.clue_text}</p>}
    </section>;
  })}</div>;
}
