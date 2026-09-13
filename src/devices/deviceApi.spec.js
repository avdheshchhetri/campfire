import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ phoneRpc: vi.fn(), mainRpc: vi.fn(), createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mock.createClient }));
vi.mock('../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: { rpc: mock.mainRpc } }));
let api;
beforeEach(async () => {
  vi.resetModules(); vi.resetAllMocks(); localStorage.clear();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
  mock.createClient.mockReturnValue({ rpc: mock.phoneRpc });
  api = await import('./deviceApi.js');
});
afterEach(() => vi.unstubAllEnvs());

it('claims and persists a cryptographically random token without creating a guest', async () => {
  mock.phoneRpc.mockResolvedValue({ data: { user_id: 'owner' }, error: null });
  const result = await api.claimDevicePair(' abc234 ');
  expect(result.token).toMatch(/^[a-f0-9]{64}$/);
  expect(localStorage.getItem(api.DEVICE_TOKEN_KEY)).toBe(result.token);
  expect(mock.phoneRpc).toHaveBeenCalledWith('claim_device_pair', { p_code: 'ABC234', p_token: result.token });
  expect(api.readDeviceChoice().token).toBe(result.token);
  expect(mock.createClient.mock.calls[0][2].auth).toMatchObject({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
  expect(mock.mainRpc).not.toHaveBeenCalled();
});

it('reuses the pending token after a lost claim response, including module reload', async () => {
  mock.phoneRpc.mockRejectedValueOnce(new Error('Lost response'));
  await expect(api.claimDevicePair('ABC234')).rejects.toThrow('Lost response');
  const first = mock.phoneRpc.mock.calls[0][1].p_token;
  expect(localStorage.getItem(api.DEVICE_TOKEN_KEY)).toBeNull();
  vi.resetModules(); api = await import('./deviceApi.js');
  mock.phoneRpc.mockResolvedValue({ data: { user_id: 'owner' }, error: null });
  const result = await api.claimDevicePair('ABC234');
  expect(result.token).toBe(first);
});

it('storage failure prevents consuming a one-time code', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  try {
    await expect(api.claimDevicePair('ABC234')).rejects.toThrow('Storage blocked');
    expect(mock.phoneRpc).not.toHaveBeenCalled();
  } finally { storage.mockRestore(); }
});

it('presence RPC sends token and session without a caller-supplied identity', async () => {
  mock.phoneRpc.mockResolvedValue({ data: null, error: null });
  await api.writeDeviceState('token', 'session', 'down');
  expect(mock.phoneRpc).toHaveBeenCalledWith('set_device_presence', { p_token: 'token', p_session_id: 'session', p_state: 'down' });
  mock.phoneRpc.mockResolvedValue({ data: null, error: { code: '28000', message: 'Not paired' } });
  await expect(api.resolveDevice('invalid')).rejects.toMatchObject({ code: '28000' });
});
