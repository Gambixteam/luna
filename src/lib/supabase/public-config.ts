export const DEFAULT_SUPABASE_URL = 'https://agbqssuutqtzmdcqhjyk.supabase.co';

// Supabase publishable keys are intentionally public and are secured by Row Level Security.
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_pnuxInkkt3X3Ex78c9dbMw_6RV4_Tmk';

export function getPublicSupabaseConfig() {
  return {
    supabaseUrl: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  };
}
