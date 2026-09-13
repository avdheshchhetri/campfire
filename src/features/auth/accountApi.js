import { supabase } from '../../lib/supabaseClient';

const redirectTo = () => new URL(import.meta.env.BASE_URL, window.location.origin).href;
function checked(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export async function loginAccount(email, password) {
  return checked(await supabase.auth.signInWithPassword({ email: email.trim(), password }));
}
export async function registerAccount(displayName, email, password) {
  return checked(await supabase.auth.signUp({ email: email.trim(), password,
    options: { emailRedirectTo: redirectTo(), data: { display_name: displayName.trim() } } }));
}
export async function linkGuestEmail(email) {
  return checked(await supabase.auth.updateUser({ email: email.trim() }, { emailRedirectTo: redirectTo() }));
}
export async function setAccountPassword(password) {
  return checked(await supabase.auth.updateUser({ password }));
}
export async function logoutAccount() {
  return checked(await supabase.auth.signOut({ scope: 'local' }));
}
export async function saveAvatar(userId, avatarKey) {
  if (!['initials', 'flame', 'fox', 'owl', 'rocket', 'leaf', 'star'].includes(avatarKey)) throw new Error('Choose an available avatar.');
  checked(await supabase.auth.updateUser({ data: { avatar_key: avatarKey } }));
  const result = await supabase.from('profiles').update({ avatar_key: avatarKey }).eq('id', userId).select('id').single();
  if (['42703', 'PGRST204'].includes(result.error?.code)) return { shared: false };
  checked(result);
  return { shared: true };
}
