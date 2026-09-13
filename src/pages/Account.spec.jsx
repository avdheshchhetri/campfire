import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import Account from './Account';
vi.mock('../features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id:'one', email:'person@example.com', is_anonymous:false }, profile:{display_name:'Person'} }) }));
vi.mock('../features/auth/accountApi', () => ({ setAccountPassword: vi.fn().mockResolvedValue({}), linkGuestEmail:vi.fn(), logoutAccount:vi.fn(), saveAvatar:vi.fn() }));
afterEach(cleanup);
it('opens password editing only on request and closes it after saving', async () => {
  render(<MemoryRouter><Account /></MemoryRouter>);
  expect(screen.queryByLabelText('Set or change password')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Set or change password'}));
  fireEvent.change(screen.getByLabelText('Set or change password'),{target:{value:'a-long-test-password'}});
  fireEvent.click(screen.getByRole('button',{name:'Save password'}));
  await waitFor(()=>expect(screen.queryByLabelText('Set or change password')).toBeNull());
  expect(screen.getByRole('status').textContent).toContain('Password saved');
});
