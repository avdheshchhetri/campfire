import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Leaderboard from './Leaderboard';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: mocks.from } }));
vi.mock('react-router-dom', async () => ({
  ...await vi.importActual('react-router-dom'),
  useParams: () => ({ roomId: 'room-one' }),
  useOutletContext: () => ({ room: { name: 'Study circle' } }),
}));

let fixtures;
let requests;
let errors;
beforeEach(() => {
  fixtures = { leaderboard: [], room_members: [] };
  requests = [];
  errors = {};
  mocks.from.mockReset().mockImplementation(table => {
    const request = { table, filters: [] };
    requests.push(request);
    const query = {
      select: columns => { request.columns = columns; return query; },
      eq: (column, value) => { request.filters.push([column, value]); return query; },
      order: () => query,
      then: (resolve, reject) => Promise.resolve({
        data: errors[table] ? null : fixtures[table].filter(row => request.filters.every(([column, value]) => row[column] === value)),
        error: errors[table] ? { message: errors[table] } : null,
      }).then(resolve, reject),
    };
    return query;
  });
});
afterEach(cleanup);

it('enriches view scores with each room member avatar without adding avatar to the view query', async () => {
  fixtures.leaderboard = [{ room_id: 'room-one', user_id: 'ari', display_name: 'Ari', verified_count: 2, total_topics: 4 }];
  fixtures.room_members = [
    { room_id: 'room-one', user_id: 'ari', profiles: { display_name: 'Ari', avatar_url: 'moon' } },
    { room_id: 'another-room', user_id: 'ari', profiles: { display_name: 'Ari', avatar_url: 'book' } },
  ];
  render(<MemoryRouter><Leaderboard /></MemoryRouter>);
  expect(await screen.findByRole('img', { name: "Ari's moon avatar" })).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
  expect(requests.find(request => request.table === 'leaderboard').columns).not.toContain('avatar_url');
  expect(requests.find(request => request.table === 'room_members').columns).toContain('display_name, avatar_url');
  expect(requests.every(request => request.filters.some(([column, value]) => column === 'room_id' && value === 'room-one'))).toBe(true);
});

it('keeps member avatars visible in rooms with no topics, including array-shaped joins', async () => {
  fixtures.room_members = [{ room_id: 'room-one', user_id: 'sam', profiles: [{ display_name: 'Sam', avatar_url: 'leaf' }] }];
  render(<MemoryRouter><Leaderboard /></MemoryRouter>);
  expect(await screen.findByRole('img', { name: "Sam's leaf avatar" })).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
});

it('preserves available scores and names if optional avatar enrichment is unavailable', async () => {
  fixtures.leaderboard = [{ room_id: 'room-one', user_id: 'ari', display_name: 'Ari', verified_count: 1, total_topics: 4 }];
  errors.room_members = 'Profile details unavailable';
  render(<MemoryRouter><Leaderboard /></MemoryRouter>);
  expect(await screen.findByRole('img', { name: "Ari's flame avatar" })).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25');
  expect(screen.getByRole('alert').textContent).toContain('avatars could not be loaded');
});
