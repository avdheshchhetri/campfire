import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SharedScreen from './SharedScreen';

const mocks = vi.hoisted(() => ({ from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock('../supabaseClient.js', () => ({ supabase: mocks }));

const participants = [
  { user_id: 'ari', name: 'Ari', avatar_url: 'moon' },
  { user_id: 'sam', name: 'Sam', avatar_url: 'leaf' },
];
let channel;
let handlers;
let subscribed;
let presence;
let databaseRows;
let databaseSession;
let reads;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  mocks.from.mockReset();
  mocks.channel.mockReset();
  mocks.removeChannel.mockReset().mockResolvedValue('ok');
  handlers = [];
  reads = [];
  presence = { 'ari-phone': [{ user_id: 'ari' }], 'sam-phone': [{ user_id: 'sam' }] };
  databaseRows = [{ user_id: 'ari', phone_state: 'down' }, { user_id: 'sam', phone_state: 'down' }];
  databaseSession = { id: 'session-one', is_active: true, ended_at: null };
  channel = {
    on: vi.fn((kind, filter, callback) => { handlers.push({ kind, filter, callback }); return channel; }),
    subscribe: vi.fn(callback => { subscribed = callback; return channel; }),
    presenceState: () => presence,
  };
  mocks.channel.mockReturnValue(channel);
  mocks.from.mockImplementation(table => {
    const read = { table, filters: [] };
    reads.push(read);
    const query = {
      select: () => query,
      eq: (column, value) => { read.filters.push([column, value]); return query; },
      single: async () => ({ data: { ...databaseSession }, error: null }),
      then: (resolve, reject) => Promise.resolve({ data: databaseRows.map(row => ({ ...row })), error: null }).then(resolve, reject),
    };
    return query;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function connect() {
  await act(async () => {
    await subscribed('SUBSCRIBED');
    handlers.find(handler => handler.kind === 'presence').callback();
  });
}

async function advance(milliseconds) {
  await act(async () => { vi.advanceTimersByTime(milliseconds); });
}

async function notifyPresenceChange() {
  await act(async () => {
    handlers.find(handler => handler.kind === 'postgres_changes' && handler.filter.table === 'session_presence').callback();
  });
}

it('counts only time when every roster phone is online and down, reacting to realtime changes before a poll', async () => {
  // A saved down state alone does not prove that Sam's phone is connected.
  presence = { 'ari-phone': [{ user_id: 'ari' }] };
  render(<SharedScreen sessionId="session-one" participants={participants} />);
  await connect();
  expect(screen.getByRole('status').textContent).toBe('Timer paused');
  expect(screen.getByText('Waiting for phones: Sam')).toBeTruthy();
  expect(screen.getByRole('img', { name: "Ari's moon avatar" })).toBeTruthy();
  expect(screen.getByRole('img', { name: "Sam's leaf avatar" })).toBeTruthy();
  await advance(800);
  expect(screen.getByLabelText('Focus time 00:00:00')).toBeTruthy();

  presence['sam-phone'] = [{ user_id: 'sam' }];
  await act(async () => { handlers.find(handler => handler.kind === 'presence').callback(); });
  expect(screen.getByRole('status').textContent).toBe('Everyone is focused');
  await advance(1200);
  expect(screen.getByLabelText('Focus time 00:00:01')).toBeTruthy();

  const beforeFlip = performance.now();
  const readsBeforeFlip = reads.length;
  databaseRows[1].phone_state = 'up';
  await notifyPresenceChange();
  // The real watcher performs a fresh filtered read without advancing time
  // to its five-second reconciliation interval.
  expect(performance.now()).toBe(beforeFlip);
  expect(reads.length).toBe(readsBeforeFlip + 2);
  expect(reads.filter(read => read.table === 'session_presence').every(read => read.filters.some(
    ([column, value]) => column === 'session_id' && value === 'session-one',
  ))).toBe(true);
  expect(screen.getByRole('status').textContent).toBe('Timer paused');
  expect(screen.getByText('Waiting for phones: Sam')).toBeTruthy();
  const samRow = screen.getByText('Sam').closest('li');
  expect(within(samRow).getByText('Phone up / flagged')).toBeTruthy();
  await advance(1200);
  expect(screen.getByLabelText('Focus time 00:00:01')).toBeTruthy();

  databaseRows[1].phone_state = 'down';
  await notifyPresenceChange();
  await advance(1000);
  expect(screen.getByLabelText('Focus time 00:00:02')).toBeTruthy();
  delete presence['sam-phone'];
  await act(async () => { handlers.find(handler => handler.kind === 'presence').callback(); });
  expect(within(samRow).getByText('Phone offline / waiting')).toBeTruthy();
  await advance(700);
  expect(screen.getByLabelText('Focus time 00:00:02')).toBeTruthy();
});

it('pauses on connection loss and waits for a fresh snapshot plus live phone presence before resuming', async () => {
  render(<SharedScreen sessionId="session-one" participants={participants} />);
  await connect();
  await advance(1000);
  expect(screen.getByLabelText('Focus time 00:00:01')).toBeTruthy();
  await act(async () => { await subscribed('CHANNEL_ERROR'); });
  expect(screen.getByRole('status').textContent).toBe('Timer paused');
  expect(screen.getByText('Waiting for phones: Ari, Sam')).toBeTruthy();
  expect(screen.getByText(/Sync: disconnected/)).toBeTruthy();
  await advance(2000);
  expect(screen.getByLabelText('Focus time 00:00:01')).toBeTruthy();

  await act(async () => { await subscribed('SUBSCRIBED'); });
  expect(screen.getByRole('status').textContent).toBe('Timer paused');
  await act(async () => { handlers.find(handler => handler.kind === 'presence').callback(); });
  expect(screen.getByRole('status').textContent).toBe('Everyone is focused');
  await advance(1000);
  expect(screen.getByLabelText('Focus time 00:00:02')).toBeTruthy();
});

it('removes realtime and visibility subscriptions, cancels polling and ignores late callbacks on unmount', async () => {
  const addListener = vi.spyOn(document, 'addEventListener');
  const removeListener = vi.spyOn(document, 'removeEventListener');
  const view = render(<SharedScreen sessionId="session-one" participants={participants} />);
  await connect();
  await advance(1000);
  const visibilityListener = addListener.mock.calls.find(([event]) => event === 'visibilitychange')[1];
  const readCount = reads.length;
  view.unmount();
  expect(mocks.channel).toHaveBeenCalledWith('campfire:session-one');
  expect(mocks.removeChannel).toHaveBeenCalledOnce();
  expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  expect(removeListener).toHaveBeenCalledWith('visibilitychange', visibilityListener);
  await act(async () => {
    handlers.forEach(handler => handler.callback());
    await subscribed('SUBSCRIBED');
    vi.advanceTimersByTime(15000);
  });
  expect(reads).toHaveLength(readCount);
  expect(vi.getTimerCount()).toBe(0);
});
