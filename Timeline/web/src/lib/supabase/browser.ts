import { createBrowserClient } from "@supabase/ssr";

import { requireEnv, requirePublicSupabaseKey } from "../env";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicSupabaseKey(),
  );
}
