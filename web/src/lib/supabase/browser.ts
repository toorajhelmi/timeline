import { createBrowserClient } from "@supabase/ssr";

import { env, requirePublicSupabaseKey } from "../env";

export function createSupabaseBrowserClient() {
  // NOTE: In Next.js client bundles, `process.env[dynamicKey]` is not reliable.
  // Use statically-referenced `env.*` so Next can inline NEXT_PUBLIC_* values.
  if (!env.supabaseUrl) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }
  return createBrowserClient(
    env.supabaseUrl,
    requirePublicSupabaseKey(),
  );
}
