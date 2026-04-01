import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const supabaseWorkspaceId = String(import.meta.env.VITE_SUPABASE_WORKSPACE_ID ?? 'default').trim() || 'default';

let cachedClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cachedClient) return cachedClient;
  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedClient;
}

