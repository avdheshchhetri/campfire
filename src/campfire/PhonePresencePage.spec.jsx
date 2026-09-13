import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  channel: vi.fn(), removeChannel: vi.fn(), resolveDevice: vi.fn(), writeDeviceState: vi.fn(),
}));
vi.mock('../devices/deviceApi.js', () => ({
  pairedClient: { channel: mocks.channel, removeChannel: mocks.removeChannel },
  resolveDevice: mocks.resolveDevice, writeDeviceState: mocks.writeDeviceState,
}));
import PhonePresencePage from './PhonePresencePage.jsx';

let channel, subscribed, hidden, permission;
const props = { sessionId: 'session', token: 'paired-secret', userId: 'laptop-user', displayName: 'Aaryan', avatarUrl: 'fox' };
const device = { device_id: 'phone', user_id: 'laptop-user', sessions: [{ id: 'session' }] };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { await act(async () => {}); };
const states = () => mocks.writeDeviceState.mock.calls.map(call => call[2]);
const orient = (beta, gamma = 0) => {
  const event = new Event('deviceorientation');
  Object.assign(event, { beta, gamma });
  fireEvent(window, event);
};
async function openPhone(extra = {}) {
  const view = render(<PhonePresencePage {...props} {...extra} />);
  await settle();
  await act(async () => { subscribed('SUBSCRIBED'); });
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal('isSecureContext', true);
  permission = vi.fn().mockResolvedValue('granted');
  vi.stubGlobal('DeviceOrientationEvent', { requestPermission: permission });
  channel = {
    subscribe: vi.fn(callback => { subscribed = callback; return channel; }),
    track: vi.fn().mockResolvedValue('ok'),
    untrack: vi.fn().mockResolvedValue('ok'),
  };
  mocks.channel.mockReturnValue(channel);
  mocks.removeChannel.mockResolvedValue('ok');
  mocks.resolveDevice.mockResolvedValue(device);
  mocks.writeDeviceState.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('uses the paired laptop identity and waits for an explicit iOS permission tap', async () => {
  await openPhone();
  expect(screen.getByText('Paired as Aaryan')).toBeTruthy();
  expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Aaryan');
  expect(mocks.channel).toHaveBeenCalledWith('campfire:session');
  expect(channel.track).toHaveBeenCalledWith({ user_id: 'laptop-user' });
  expect(mocks.writeDeviceState).toHaveBeenCalledWith('paired-secret', 'session', 'up');
  expect(permission).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Enable Motion Detection' }));
  expect(permission).toHaveBeenCalledTimes(1);
  await settle();
  expect(screen.getByRole('button', { name: 'Motion Detection Enabled' }).disabled).toBe(true);
});

it('reflects raw sensor flips immediately while the previous state request is pending', async () => {
  await openPhone();
  fireEvent.click(screen.getByRole('button', { name: 'Enable Motion Detection' }));
  await settle();
  const pending = deferred();
  mocks.writeDeviceState.mockImplementationOnce(() => pending.promise);
  const before = states().length;
  orient(180);
  expect(screen.getByText('Face-down / focused')).toBeTruthy();
  expect(states().slice(before)).toEqual(['down']);
  orient(0);
  expect(screen.getByText('Face-up / paused')).toBeTruthy();
  expect(states().slice(before)).toEqual(['down']);
  await act(async () => { pending.resolve(); });
  expect(states().slice(before)).toEqual(['down', 'up']);
});

it('applies simulation changes immediately and retains the latest change during a slow write', async () => {
  await openPhone();
  const pending = deferred();
  mocks.writeDeviceState.mockImplementationOnce(() => pending.promise);
  const before = states().length;
  fireEvent.click(screen.getByRole('button', { name: 'Simulate Face-Down' }));
  expect(screen.getByText('Face-down / focused')).toBeTruthy();
  expect(states().slice(before)).toEqual(['down']);
  fireEvent.click(screen.getByRole('button', { name: 'Stop Simulating Face-Down' }));
  expect(screen.getByText('Face-up / paused')).toBeTruthy();
  await act(async () => { pending.resolve(); });
  expect(states().slice(before)).toEqual(['down', 'up']);
});

it('reconciles access every five seconds without rewriting unchanged phone state', async () => {
  await openPhone();
  const writes = states().length;
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(mocks.resolveDevice).toHaveBeenCalledTimes(4);
  expect(states()).toHaveLength(writes);
});

it('untracks a hidden page and returns as face-up with a fresh connection sync', async () => {
  await openPhone();
  fireEvent.click(screen.getByRole('button', { name: 'Simulate Face-Down' }));
  await settle();
  hidden = true;
  fireEvent(document, new Event('visibilitychange'));
  await settle();
  expect(channel.untrack).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Face-up / paused')).toBeTruthy();
  expect(states().at(-1)).toBe('up');
  const writes = states().length;
  hidden = false;
  fireEvent(document, new Event('visibilitychange'));
  await settle();
  expect(channel.track).toHaveBeenCalledTimes(2);
  expect(states()).toHaveLength(writes + 1);
  expect(screen.getByRole('button', { name: 'Simulate Face-Down' }).getAttribute('aria-pressed')).toBe('false');
});

it('untracks after a pending track completes if pagehide happened during registration', async () => {
  const pending = deferred();
  channel.track.mockImplementationOnce(() => pending.promise);
  await openPhone();
  fireEvent(window, new Event('pagehide'));
  expect(channel.untrack).not.toHaveBeenCalled();
  await act(async () => { pending.resolve('ok'); });
  expect(channel.untrack).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Face-up / paused')).toBeTruthy();
});

it('forces unchanged state to sync again when Realtime reconnects', async () => {
  await openPhone();
  const before = states().length;
  await act(async () => { subscribed('CHANNEL_ERROR'); subscribed('SUBSCRIBED'); });
  expect(states().slice(before)).toEqual(['up']);
  expect(channel.track).toHaveBeenCalledTimes(2);
});

it('offers simulation when the browser has no orientation sensor', async () => {
  vi.stubGlobal('DeviceOrientationEvent', undefined);
  await openPhone();
  fireEvent.click(screen.getByRole('button', { name: 'Enable Motion Detection' }));
  await settle();
  expect(screen.getByText(/This browser has no orientation API/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Simulate Face-Down' }));
  expect(screen.getByText('Face-down / focused')).toBeTruthy();
});

it('keeps simulation usable when iOS denies motion permission', async () => {
  permission.mockResolvedValue('denied');
  await openPhone();
  fireEvent.click(screen.getByRole('button', { name: 'Enable Motion Detection' }));
  await settle();
  expect(screen.getByText(/Motion permission denied/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Simulate Face-Down' }));
  expect(screen.getByText('Face-down / focused')).toBeTruthy();
  expect(states().at(-1)).toBe('down');
});

it('explains a sensor that provides no events and retains the manual fallback', async () => {
  await openPhone();
  fireEvent.click(screen.getByRole('button', { name: 'Enable Motion Detection' }));
  await settle();
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  expect(screen.getByText(/No sensor data received/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Simulate Face-Down' }).disabled).toBe(false);
});

it('stops writes and notifies the parent when the token is revoked', async () => {
  const onSessionEnded = vi.fn();
  await openPhone({ onSessionEnded });
  mocks.resolveDevice.mockRejectedValue(Object.assign(new Error('Invalid token'), { code: '28000' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(onSessionEnded).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert').textContent).toContain('Pair it again');
  expect(screen.getByRole('button', { name: 'Simulate Face-Down' }).disabled).toBe(true);
  const checks = mocks.resolveDevice.mock.calls.length, writes = states().length;
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(mocks.resolveDevice).toHaveBeenCalledTimes(checks);
  expect(states()).toHaveLength(writes);
});

it('detects an ended session and keeps transient network errors recoverable', async () => {
  const onSessionEnded = vi.fn();
  await openPhone({ onSessionEnded });
  mocks.resolveDevice.mockRejectedValueOnce(new Error('Failed to fetch'));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(onSessionEnded).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('retrying automatically');
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.queryByRole('alert')).toBeNull();
  mocks.resolveDevice.mockResolvedValue({ ...device, sessions: [] });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(onSessionEnded).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Simulate Face-Down' }).disabled).toBe(true);
});

it('cleans up Realtime, polling, sensor events and queued retries on unmount', async () => {
  const view = await openPhone();
  const pending = deferred();
  mocks.writeDeviceState.mockImplementationOnce(() => pending.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Simulate Face-Down' }));
  view.unmount();
  const writes = states().length, checks = mocks.resolveDevice.mock.calls.length;
  await act(async () => { pending.reject(new Error('offline')); await vi.advanceTimersByTimeAsync(20000); });
  expect(states()).toHaveLength(writes);
  expect(mocks.resolveDevice).toHaveBeenCalledTimes(checks);
  expect(channel.untrack).toHaveBeenCalled();
  expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
});
