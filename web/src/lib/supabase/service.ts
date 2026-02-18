import { createClient } from "@supabase/supabase-js";

import { env } from "../env";

/**
 * Server-only service role client.
 *
 * Used to operate admin pages without requiring user auth (temporary v0).
 * Returns null if not configured.
 */
export function createSupabaseServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!env.supabaseUrl || !serviceKey) return null;

  return createClient(env.supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

