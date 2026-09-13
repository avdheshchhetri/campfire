import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import PairDevicePanel from './PairDevicePanel.jsx';

const mock = vi.hoisted(() => ({ createDevicePair: vi.fn(), qr: vi.fn() }));
vi.mock('./deviceApi.js', () => ({ createDevicePair: mock.createDevicePair }));
vi.mock('qrcode.react', () => ({ QRCodeSVG: props => { mock.qr(props.value); return <svg aria-label={props.title} />; } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState({}, '', '/'); });

it.each([[BrowserRouter, '/pair?code=ABC234'], [HashRouter, '/#/pair?code=ABC234']])('encodes a local-origin pairing URL in the QR using the active router', async (Router, path) => {
  mock.createDevicePair.mockResolvedValue({ pairing_code: 'ABC234', created_at: new Date().toISOString() });
  render(<Router><PairDevicePanel /></Router>);
  fireEvent.click(screen.getByRole('button', { name: 'Add Distraction Device' }));
  expect(await screen.findByText('ABC234')).toBeTruthy();
  const link = screen.getByRole('link');
  expect(link.href).toBe(`${window.location.origin}${path}`);
  expect(mock.qr).toHaveBeenLastCalledWith(link.href);
  expect(mock.createDevicePair).toHaveBeenCalledWith('My phone');
});
