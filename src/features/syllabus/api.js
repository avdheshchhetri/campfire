import { supabase } from '../../supabaseClient.js';

export async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Sign in to Campfire before continuing.');
  return data.user;
}

export async function callStudyAPI(path, body) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Your sign-in expired. Please sign in again.');
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(65000),
    });
  } catch { throw new Error('The request timed out or the network is unavailable. Please retry.'); }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('The API did not return JSON. Run this module on Vercel or with vercel dev.'); }
  if (!response.ok) {
    const err = new Error(result.error || 'The request failed. Please retry.');
    err.status = response.status; throw err;
  }
  return result;
}
