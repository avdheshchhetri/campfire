import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChallengePanel } from './ChallengeEngine';

afterEach(cleanup);
it('renders chosen avatars alongside all participant names, including the current member', async () => {
  const adapter = {
    load: vi.fn().mockResolvedValue({ challenge: null, clues: [], players: [
      { user_id: 'ari', display_name: 'Ari', avatar_url: 'book' },
      { user_id: 'sam', display_name: 'Sam', avatar_url: 'star' },
    ] }),
    subscribe: () => () => {}, start: vi.fn(), submit: vi.fn(), cancel: vi.fn(),
  };
  render(<ChallengePanel adapter={adapter} userId="ari" />);
  expect(await screen.findByRole('img', { name: "Ari's book avatar" })).toBeTruthy();
  expect(screen.getByText('Ari (You)')).toBeTruthy();
  expect(screen.getByRole('img', { name: "Sam's star avatar" })).toBeTruthy();
  expect(screen.getByText('Sam')).toBeTruthy();
});
