import { redirect } from "next/navigation";

import { hasPublicSupabaseEnv } from "../env";
import { createSupabaseServerClient } from "../supabase/server";
import { createSupabaseServiceClient } from "../supabase/service";

function safeNext(nextRaw: string): string {
  const n = String(nextRaw ?? "").trim();
  if (!n) return "/dashboard/events";
  if (!n.startsWith("/")) return "/dashboard/events";
  if (n.startsWith("//")) return "/dashboard/events";
  return n;
}

export async function requireAdmin(opts?: { nextPath?: string }) {
  if (!hasPublicSupabaseEnv()) redirect("/");

  const nextPath = safeNext(opts?.nextPath ?? "/dashboard/events");

  // Require a logged-in user.
  const sessionClient = await createSupabaseServerClient();
  const { data: userData } = await sessionClient.auth.getUser();
  const user = userData.user;
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);

  // Check admin role via profile flag.
  const { data: profile, error: pErr } = await sessionClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (pErr || !profile?.is_admin) redirect("/?error=admin_only");

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    throw new Error(
      "Admin mode requires SUPABASE_SERVICE_ROLE_KEY to be set on the server.",
    );
  }

  return { supabase, user };
}

