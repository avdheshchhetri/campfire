import { supabase } from '../../lib/supabaseClient';

function getClient() {
  if (!supabase) throw new Error('Connect Supabase to use study rooms.');
  return supabase;
}

function throwIfError(error) {
  if (error) throw new Error(error.message || 'Unable to update the room. Please try again.');
}

export async function listMyRooms(userId) {
  if (!userId) return [];
  const { data, error } = await getClient().from('room_members')
    .select('rooms(id, name, subject, join_code, exam_date, created_by, created_at)')
    .eq('user_id', userId);
  throwIfError(error);
  return (data ?? []).map((membership) => membership.rooms).filter(Boolean)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

// The SQL function creates the room and its first membership in one transaction.
export async function createRoom({ name, subject = '', examDate = '' }) {
  const trimmedName = String(name ?? '').trim();
  if (!trimmedName || trimmedName.length > 100) throw new Error('Enter a room name between 1 and 100 characters.');
  const { data, error } = await getClient().rpc('create_room', {
    p_name: trimmedName,
    p_subject: String(subject ?? '').trim() || null,
    p_exam_date: examDate || null,
  });
  throwIfError(error);
  if (!data) throw new Error('The room could not be created. Please try again.');
  return data;
}

export async function joinRoom(joinCode) {
  const code = String(joinCode ?? '').trim().toUpperCase();
  if (!code) throw new Error('Enter a room code.');
  const { data, error } = await getClient().rpc('join_room', { p_join_code: code });
  throwIfError(error);
  if (!data) throw new Error('That room code was not found. Check the code and try again.');
  return data;
}

export async function leaveRoom(roomId, userId) {
  if (!roomId || !userId) throw new Error('Sign in and choose a room before leaving.');
  const { error } = await getClient().from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);
  throwIfError(error);
}
