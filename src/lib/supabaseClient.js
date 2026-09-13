import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const isSupabaseConfigured = Boolean(url && anonKey && /^https?:\/\//.test(url) && !/YOUR_PROJECT_REF/i.test(url) && !/YOUR_SUPABASE/i.test(anonKey));

// Every feature imports this single client. Never put a service-role or AI key here.
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export default supabase;
