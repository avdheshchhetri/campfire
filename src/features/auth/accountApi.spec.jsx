import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signUp: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: mocks, from: () => mocks } }));
import { linkGuestEmail, loginAccount, logoutAccount, registerAccount, saveAvatar, setAccountPassword } from './accountApi';
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ['signInWithPassword', 'signUp', 'updateUser', 'signOut', 'single']) mocks[key].mockResolvedValue({ data: {}, error: null });
  for (const key of ['update', 'eq', 'select']) mocks[key].mockReturnValue(mocks);
});
describe('account authentication', () => {
  it('logs in with email and password and surfaces rejected credentials', async () => {
    await loginAccount(' user@example.com ', 'password123');
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.com', password: 'password123' });
    mocks.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    await expect(loginAccount('user@example.com', 'bad')).rejects.toThrow('Invalid login credentials');
  });
  it('registers with display name and a deployment-relative confirmation URL', async () => {
    await registerAccount(' Ada ', 'ada@example.com', 'password123');
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { data: { display_name: 'Ada' }, emailRedirectTo: expect.stringContaining(window.location.origin) } }));
  });
  it('links guest email separately from setting the verified account password', async () => {
    await linkGuestEmail('ada@example.com');
    expect(mocks.updateUser).toHaveBeenCalledWith({ email: 'ada@example.com' }, expect.any(Object));
    await setAccountPassword('password123');
    expect(mocks.updateUser).toHaveBeenLastCalledWith({ password: 'password123' });
  });
  it('signs out only this device', async () => { await logoutAccount(); expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' }); });
  it('saves a whitelisted avatar only on the current profile', async () => {
    await expect(saveAvatar('current-user', 'fox')).resolves.toEqual({ shared: true });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'current-user');
    await expect(saveAvatar('current-user', 'invalid')).rejects.toThrow('Choose an available avatar');
  });
  it('keeps account avatars usable before the additive migration is applied', async () => {
    mocks.single.mockResolvedValue({ error: { code: 'PGRST204' } });
    await expect(saveAvatar('current-user', 'owl')).resolves.toEqual({ shared: false });
  });
});
