import { supabaseConfigured } from "@cartel/platform/env";
export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return supabaseConfigured(url, key) && url && key ? { url, key } : null;
}
