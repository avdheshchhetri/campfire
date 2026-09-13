import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeviceGate from './DeviceGate.jsx';
import SecondaryDevice from './SecondaryDevice.jsx';

const mocks = vi.hoisted(() => ({
  readDeviceChoice: vi.fn(), chooseMainDevice: vi.fn(), claimDevicePair: vi.fn(),
  forgetDevice: vi.fn(), resolveDevice: vi.fn(), phone: vi.fn(), main: vi.fn(),
}));
vi.mock('./deviceApi.js', () => mocks);
vi.mock('../campfire/PhonePresencePage.jsx', () => ({
  default: props => {
    mocks.phone(props);
    return <p data-testid="phone" data-token={props.token} data-user={props.userId} data-session={props.sessionId}>Phone for {props.displayName}</p>;
  },
}));

const sessionA = { id: 'session-a', room_id: 'room-a', room_name: 'Biology', started_at: '2026-09-13T12:00:00Z' };
const sessionB = { id: 'session-b', room_id: 'room-b', room_name: 'Chemistry', started_at: '2026-09-13T13:00:00Z' };
const alice = { user_id: 'alice', display_name: 'Alice', avatar_url: 'flame', sessions: [sessionA] };
const bob = { user_id: 'bob', display_name: 'Bob', avatar_url: 'leaf', sessions: [sessionB] };
let choice;
let polls;

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function MainTools() { mocks.main(); return <p>Main study tools</p>; }
function openGate(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><DeviceGate><MainTools /></DeviceGate></MemoryRouter>);
}
async function poll() {
  await act(async () => { for (const callback of [...polls.values()]) await callback(); });
}
async function storageChoice(next) {
  choice = next;
  await act(async () => { window.dispatchEvent(new Event('storage')); });
}

beforeEach(() => {
  vi.resetAllMocks();
  choice = {};
  polls = new Map();
  let intervalId = 0;
  vi.spyOn(globalThis, 'setInterval').mockImplementation(callback => {
    const id = ++intervalId;
    polls.set(id, callback);
    return id;
  });
  vi.spyOn(globalThis, 'clearInterval').mockImplementation(id => { polls.delete(id); });
  mocks.readDeviceChoice.mockImplementation(() => choice);
  mocks.chooseMainDevice.mockImplementation(() => { choice = { main: true }; });
  mocks.forgetDevice.mockImplementation(() => { choice = {}; });
  mocks.resolveDevice.mockImplementation(async token => token === 'token-b' ? bob : alice);
  mocks.claimDevicePair.mockResolvedValue({ token: 'token-a', device: alice });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('device gate and secondary identity', () => {
  it('pairs from a code and mounts only the secondary tools after resolving the token', async () => {
    const pending = deferred();
    mocks.claimDevicePair.mockReturnValueOnce(pending.promise);
    openGate('/pair?code=ABC234');
    expect(screen.getByLabelText('Enter pairing code').value).toBe('ABC234');
    expect(mocks.main).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Pair this phone' }));
    expect(screen.getByRole('button', { name: 'Pairing…' }).disabled).toBe(true);
    expect(mocks.claimDevicePair).toHaveBeenCalledWith('ABC234');
    await act(async () => pending.resolve({ token: 'token-a', device: alice }));
    expect((await screen.findByTestId('phone')).dataset.user).toBe('alice');
    expect(mocks.resolveDevice).toHaveBeenCalledWith('token-a');
    expect(mocks.main).not.toHaveBeenCalled();
  });

  it('lets an explicitly selected main device open the existing study app', async () => {
    openGate('/pair');
    fireEvent.click(screen.getByRole('button', { name: 'Skip, this is my own main device' }));
    expect(await screen.findByText('Main study tools')).toBeTruthy();
    expect(mocks.chooseMainDevice).toHaveBeenCalledOnce();
    expect(mocks.claimDevicePair).not.toHaveBeenCalled();
    expect(mocks.resolveDevice).not.toHaveBeenCalled();
    expect(mocks.phone).not.toHaveBeenCalled();
  });

  it('retains a saved token after a lookup failure and retries without creating another identity', async () => {
    choice = { token: 'token-a', main: true };
    mocks.resolveDevice.mockRejectedValueOnce(new Error('Network unavailable'));
    openGate('/room/room-a');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Network unavailable');
    expect(mocks.forgetDevice).not.toHaveBeenCalled();
    expect(mocks.main).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry pairing lookup' }));
    expect((await screen.findByTestId('phone')).dataset.user).toBe('alice');
    expect(mocks.claimDevicePair).not.toHaveBeenCalled();
  });

  it('never combines a newly stored token with the previously resolved profile', async () => {
    choice = { token: 'token-a' };
    openGate();
    expect((await screen.findByTestId('phone')).dataset.user).toBe('alice');
    const pendingBob = deferred();
    mocks.resolveDevice.mockImplementation(token => token === 'token-b' ? pendingBob.promise : Promise.resolve(alice));
    await storageChoice({ token: 'token-b' });
    expect(screen.queryByTestId('phone')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Checking your phone pairing…');
    await act(async () => pendingBob.resolve(bob));
    expect((await screen.findByTestId('phone')).dataset.user).toBe('bob');
    expect(mocks.phone.mock.calls.every(([props]) =>
      props.token === 'token-a' ? props.userId === 'alice' : props.userId === 'bob')).toBe(true);
    expect(mocks.main).not.toHaveBeenCalled();
  });

  it('ignores a stale lookup that completes after another token has been selected', async () => {
    choice = { token: 'token-a' };
    const pendingAlice = deferred();
    mocks.resolveDevice.mockImplementation(token => token === 'token-a' ? pendingAlice.promise : Promise.resolve(bob));
    openGate();
    await storageChoice({ token: 'token-b' });
    expect((await screen.findByTestId('phone')).dataset.user).toBe('bob');
    await act(async () => pendingAlice.resolve(alice));
    expect(screen.getByTestId('phone').dataset.user).toBe('bob');
    expect(mocks.phone.mock.calls.every(([props]) => props.userId === 'bob')).toBe(true);
  });

  it('returns a revoked pairing to recovery controls and can pair another profile without reload', async () => {
    choice = { token: 'token-a' };
    openGate();
    await screen.findByTestId('phone');
    mocks.resolveDevice.mockRejectedValueOnce(Object.assign(new Error('Pair this phone again.'), { code: '28000' }));
    await poll();
    expect(screen.queryByTestId('phone')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Pair this phone again.');
    fireEvent.click(screen.getByRole('button', { name: 'Use another pairing code' }));
    expect(mocks.forgetDevice).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('Enter pairing code'), { target: { value: 'DEF567' } });
    mocks.claimDevicePair.mockResolvedValueOnce({ token: 'token-b', device: bob });
    fireEvent.click(screen.getByRole('button', { name: 'Pair this phone' }));
    expect((await screen.findByTestId('phone')).dataset.user).toBe('bob');
    expect(mocks.phone.mock.calls.every(([props]) =>
      props.token === 'token-a' ? props.userId === 'alice' : props.userId === 'bob')).toBe(true);
  });
});

describe('secondary session selection', () => {
  it('retains the first arriving session when another room starts a newer session', async () => {
    const waiting = { ...alice, sessions: [] };
    mocks.resolveDevice.mockResolvedValue(waiting);
    render(<SecondaryDevice token="token-a" initialDevice={waiting} />);
    await waitFor(() => expect(mocks.resolveDevice).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('phone')).toBeNull();
    mocks.resolveDevice.mockResolvedValue(alice);
    await poll();
    expect(screen.getByTestId('phone').dataset.session).toBe('session-a');
    mocks.resolveDevice.mockResolvedValue({ ...alice, sessions: [sessionB, sessionA] });
    await poll();
    expect(screen.getByTestId('phone').dataset.session).toBe('session-a');
    expect(screen.getByLabelText('Focus session').value).toBe('session-a');
    // Preserve an explicit selection too, then move only after it ends.
    fireEvent.change(screen.getByLabelText('Focus session'), { target: { value: 'session-b' } });
    await poll();
    expect(screen.getByTestId('phone').dataset.session).toBe('session-b');
    mocks.resolveDevice.mockResolvedValue(alice);
    await poll();
    expect(screen.getByTestId('phone').dataset.session).toBe('session-a');
  });

  it('keeps the current session on a network failure but forwards an invalid identity for re-pairing', async () => {
    const invalid = vi.fn();
    render(<SecondaryDevice token="token-a" initialDevice={alice} onPairingInvalid={invalid} />);
    await waitFor(() => expect(mocks.resolveDevice).toHaveBeenCalledOnce());
    mocks.resolveDevice.mockRejectedValueOnce(new Error('Connection interrupted'));
    await poll();
    expect(screen.getByTestId('phone').dataset.session).toBe('session-a');
    expect(invalid).not.toHaveBeenCalled();
    mocks.resolveDevice.mockResolvedValueOnce(null);
    await poll();
    expect(screen.queryByTestId('phone')).toBeNull();
    expect(invalid).toHaveBeenCalledWith(expect.objectContaining({ code: '28000' }));
  });
});
