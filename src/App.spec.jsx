import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const mocks = vi.hoisted(() => ({
  configured: true,
  auth: {},
  from: vi.fn(),
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  listMyRooms: vi.fn(),
}));

vi.mock('./auth/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => mocks.auth,
}));

vi.mock('./lib/supabaseClient', () => ({
  get isSupabaseConfigured() { return mocks.configured; },
  supabase: { from: mocks.from },
}));

vi.mock('./lib/rooms', () => ({
  createRoom: mocks.createRoom,
  joinRoom: mocks.joinRoom,
  leaveRoom: mocks.leaveRoom,
  listMyRooms: mocks.listMyRooms,
}));

const room = {
  id: 'study-room', name: 'The biology circle', subject: 'Biology',
  join_code: 'CAMPFIRE88', exam_date: '2026-12-01', created_by: 'member-self',
};
let fixtures;
let queries;
let errors;

function openApp(path = '/') {
  window.history.replaceState({}, '', path);
  return render(<App />);
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  localStorage.setItem('campfire.main_device', 'true');
  mocks.configured = true;
  mocks.auth = {
    user: { id: 'member-self' },
    profile: { id: 'member-self', display_name: 'Test member' },
    session: { user: { id: 'member-self' } },
    loading: false, error: null, signIn: vi.fn(), retryProfile: vi.fn(),
  };
  mocks.listMyRooms.mockResolvedValue([]);
  mocks.createRoom.mockResolvedValue(room.id);
  mocks.joinRoom.mockResolvedValue(room.id);
  mocks.leaveRoom.mockResolvedValue(undefined);
  fixtures = { rooms: [room], sessions: [], leaderboard: [], room_members: [] };
  queries = [];
  errors = {};

  mocks.from.mockImplementation((table) => {
    const request = { table, select: null, filters: [], orders: [] };
    queries.push(request);
    const resolve = (single = false) => {
      if (errors[table]) return Promise.resolve({ data: null, error: { message: errors[table] } });
      let data = (fixtures[table] ?? []).filter((row) => request.filters.every(([key, value]) => row[key] === value));
      if (request.limit) data = data.slice(0, request.limit);
      return Promise.resolve({ data: single ? (data[0] ?? null) : data, error: null });
    };
    const query = {
      select: (columns) => { request.select = columns; return query; },
      eq: (column, value) => { request.filters.push([column, value]); return query; },
      order: (column, options) => { request.orders.push([column, options]); return query; },
      limit: (count) => { request.limit = count; return query; },
      maybeSingle: () => resolve(true),
      then: (fulfilled, rejected) => resolve().then(fulfilled, rejected),
    };
    return query;
  });
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('Campfire app integration', () => {
  it('shows pairing before mounting the main app in a fresh browser', () => {
    localStorage.clear();
    openApp('/');
    expect(screen.getByLabelText('Enter pairing code')).toBeTruthy();
    expect(mocks.listMyRooms).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Skip, this is my own main device' }));
    expect(screen.getByLabelText('Room name')).toBeTruthy();
    expect(localStorage.getItem('campfire.main_device')).toBe('true');
  });

  it('sends the old phone route through pairing, never orientation or room auth', () => {
    const listen = vi.spyOn(window, 'addEventListener');
    openApp(`/room/${room.id}/session/old-session/phone`);
    expect(screen.getByLabelText('Enter pairing code')).toBeTruthy();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(listen.mock.calls.some(([name]) => name === 'deviceorientation')).toBe(false);
    listen.mockRestore();
  });

  it('creates a room from the signed-in form and opens its dashboard', async () => {
    openApp();
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: room.name } });
    fireEvent.change(screen.getByLabelText(/What are you studying/), { target: { value: room.subject } });
    fireEvent.change(screen.getByLabelText(/Exam date/), { target: { value: room.exam_date } });
    fireEvent.click(screen.getByRole('button', { name: 'Create your room' }));

    expect(await screen.findByRole('heading', { level: 1, name: room.name })).toBeTruthy();
    expect(mocks.createRoom).toHaveBeenCalledWith({ name: room.name, subject: room.subject, examDate: room.exam_date });
    expect(mocks.listMyRooms).toHaveBeenCalledWith('member-self');
    expect(window.location.pathname).toBe(`/room/${room.id}`);
    expect(screen.getByText(room.join_code)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open syllabus' }).getAttribute('href')).toBe(`/room/${room.id}/syllabus`);
    expect(queries.find((query) => query.table === 'rooms').filters).toContainEqual(['id', room.id]);
  });

  it('joins by room code and opens the returned room', async () => {
    openApp();
    fireEvent.click(screen.getByRole('button', { name: 'Join a room' }));
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'CAMPFIRE88' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join your group' }));

    expect(await screen.findByRole('heading', { level: 1, name: room.name })).toBeTruthy();
    expect(mocks.joinRoom).toHaveBeenCalledWith('CAMPFIRE88');
    expect(mocks.createRoom).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe(`/room/${room.id}`);
  });

  it('keeps a failed leave visible, then returns to landing after a successful retry', async () => {
    mocks.leaveRoom.mockRejectedValueOnce(new Error('Could not leave. Please try again.'));
    openApp(`/room/${room.id}`);
    await screen.findByRole('heading', { level: 1, name: room.name });
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not leave');
    expect(window.location.pathname).toBe(`/room/${room.id}`);

    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
    expect(await screen.findByRole('heading', { name: 'Find your study circle.' })).toBeTruthy();
    expect(mocks.leaveRoom).toHaveBeenLastCalledWith(room.id, 'member-self');
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByRole('navigation', { name: 'Room navigation' })).toBeNull();
  });

  it('filters leaderboard queries to the room, displays progress, and supports member sorting', async () => {
    fixtures.leaderboard = [
      { room_id: room.id, user_id: 'zoe', display_name: 'Zoe', verified_count: 3, total_topics: 4 },
      { room_id: room.id, user_id: 'ari', display_name: 'Ari', verified_count: 3, total_topics: 4 },
      { room_id: 'another-room', user_id: 'outsider', display_name: 'Another room member', verified_count: 99, total_topics: 100 },
    ];
    openApp(`/room/${room.id}/leaderboard`);
    const bars = await screen.findAllByRole('progressbar');
    expect(bars).toHaveLength(2);
    expect(bars.every((bar) => bar.getAttribute('aria-valuenow') === '75')).toBe(true);
    expect(screen.queryByText('Another room member')).toBeNull();
    const request = queries.find((query) => query.table === 'leaderboard');
    expect(request.filters).toContainEqual(['room_id', room.id]);
    expect(request.orders[0]).toEqual(['verified_count', { ascending: false }]);
    expect(queries.some((query) => query.table === 'room_members')).toBe(true);

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')[0].textContent).toContain('Ari');
    fireEvent.change(screen.getByLabelText('Sort members'), { target: { value: 'name-desc' } });
    expect(within(list).getAllByRole('listitem')[0].textContent).toContain('Zoe');
  });

  it('shows room members at zero when the leaderboard view has no topics', async () => {
    fixtures.room_members = [
      { room_id: room.id, user_id: 'ari', profiles: { display_name: 'Ari' } },
      { room_id: room.id, user_id: 'sam', profiles: [{ display_name: 'Sam' }] },
      { room_id: 'another-room', user_id: 'outsider', profiles: { display_name: 'Outside member' } },
    ];
    openApp(`/room/${room.id}/leaderboard`);
    const bars = await screen.findAllByRole('progressbar');
    expect(bars).toHaveLength(2);
    expect(bars.every((bar) => bar.getAttribute('aria-valuenow') === '0')).toBe(true);
    expect(bars.every((bar) => bar.getAttribute('aria-valuetext') === '0 of 0 topics verified')).toBe(true);
    expect(screen.getByText(/No topics yet/)).toBeTruthy();
    expect(screen.queryByText('Outside member')).toBeNull();
    const memberRequest = queries.find((query) => query.table === 'room_members');
    expect(memberRequest.filters).toContainEqual(['room_id', room.id]);
    expect(memberRequest.select).toContain('profiles!room_members_user_id_fkey(display_name, avatar_url)');
  });

  it.each([
    ['missing', null, 'This room is unavailable. Join with its code to get access.'],
    ['forbidden', 'Access to this room was denied.', 'Access to this room was denied.'],
  ])('shows an actionable %s room state without rendering its dashboard', async (_label, error, message) => {
    fixtures.rooms = [];
    if (error) errors.rooms = error;
    openApp('/room/unavailable-room');
    expect(await screen.findByRole('heading', { name: 'We couldn’t open this room' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(message);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to your rooms' })).toBeTruthy();
    expect(screen.queryByText('Save them a seat.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Leave room' })).toBeNull();
  });

  it('checks both the deep session ID and room ID before showing the session', async () => {
    fixtures.sessions = [{ id: 'other-session', room_id: 'another-room', is_active: true }];
    openApp(`/room/${room.id}/session/other-session`);
    expect(await screen.findByRole('heading', { name: 'This session isn’t here' })).toBeTruthy();
    const sessionRequest = queries.find((query) => query.table === 'sessions'
      && query.filters.some(([column]) => column === 'id'));
    expect(sessionRequest.filters).toEqual([['id', 'other-session'], ['room_id', room.id]]);
    expect(screen.queryByText('Your group’s focus space')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to room' }).getAttribute('href')).toBe(`/room/${room.id}`);
  });

  it('opens a valid deep session and reflects its active status in navigation', async () => {
    fixtures.sessions = [{ id: 'current-session', room_id: room.id, is_active: true, started_at: '2026-09-12T12:00:00Z' }];
    openApp(`/room/${room.id}/session/current-session`);
    expect(await screen.findByRole('heading', { name: 'Your group’s focus space' })).toBeTruthy();
    expect(screen.getByText('Session live')).toBeTruthy();
    expect(within(screen.getByRole('navigation', { name: 'Room navigation' })).getByRole('link', { name: 'Session' }).getAttribute('aria-current')).toBe('page');
  });

  it('shows setup guidance and prevents sign-in without a configured backend', async () => {
    mocks.configured = false;
    mocks.auth = { ...mocks.auth, user: null, session: null, profile: null };
    openApp();
    expect(screen.getByText('Connect your study space.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('What should we call you?'), { target: { value: 'Ari' } });
    expect(screen.getByRole('button', { name: 'Take a seat' }).disabled).toBe(true);
    await waitFor(() => expect(mocks.from).not.toHaveBeenCalled());
    expect(mocks.listMyRooms).not.toHaveBeenCalled();
  });
});
