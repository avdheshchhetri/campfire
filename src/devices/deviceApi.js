import { createClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';

// A paired phone deliberately has no Supabase guest session. Its secret can
// call only the limited pairing RPCs; it never borrows the laptop's auth JWT.
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const pairedClient = isSupabaseConfigured && url && anonKey
  ? createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'campfire-secondary' },
    })
  : null;

export const DEVICE_TOKEN_KEY = 'campfire.secondary.local_token';
export const MAIN_DEVICE_KEY = 'campfire.main_device';
const PENDING_PAIR_KEY = 'campfire.secondary.pending_pair';

async function rpc(client, name, args) {
  if (!client) throw new Error('Connect Supabase before pairing a phone.');
  const { data, error } = await client.rpc(name, args);
  if (error) {
    const cause = new Error(error.message || 'The device request failed. Please try again.');
    cause.code = error.code;
    throw cause;
  }
  return data;
}

export function createDevicePair(label = 'My phone') {
  return rpc(supabase, 'create_device_pair', { p_label: label.trim() || 'My phone' });
}

export function resolveDevice(token) {
  return rpc(pairedClient, 'resolve_device_pair', { p_token: token });
}

export function writeDeviceState(token, sessionId, state) {
  return rpc(pairedClient, 'set_device_presence', { p_token: token, p_session_id: sessionId, p_state: state });
}

export function readDeviceChoice() {
  return { token: localStorage.getItem(DEVICE_TOKEN_KEY), main: localStorage.getItem(MAIN_DEVICE_KEY) === 'true' };
}

export function chooseMainDevice() {
  localStorage.setItem(MAIN_DEVICE_KEY, 'true');
}

export function forgetDevice() {
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  localStorage.removeItem(PENDING_PAIR_KEY);
  localStorage.removeItem(MAIN_DEVICE_KEY);
}

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function claimDevicePair(value) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Enter the 6-character pairing code from your main device.');
  let pending;
  try { pending = JSON.parse(localStorage.getItem(PENDING_PAIR_KEY) || 'null'); } catch { /* Replace corrupt pending data. */ }
  if (pending?.code !== code || !/^[a-f0-9]{64}$/.test(pending?.token || '')) pending = { code, token: randomToken() };
  // Check storage before claiming. Keep this pending token so a lost response
  // can be retried safely with the same one-time code, even after a reload.
  localStorage.setItem(PENDING_PAIR_KEY, JSON.stringify(pending));
  const device = await rpc(pairedClient, 'claim_device_pair', { p_code: code, p_token: pending.token });
  localStorage.setItem(DEVICE_TOKEN_KEY, pending.token);
  localStorage.removeItem(PENDING_PAIR_KEY);
  return { token: pending.token, device };
}
