import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/env";

/** Server-only Supabase client with service role — never expose to the browser. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;

  return createClient(getSupabaseUrl(), key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function hasAdminClient(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
