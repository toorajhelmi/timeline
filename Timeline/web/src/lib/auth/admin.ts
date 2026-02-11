import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../supabase/server";
import { hasPublicSupabaseEnv } from "../env";

export async function requireAdmin() {
  if (!hasPublicSupabaseEnv()) redirect("/");

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error) redirect("/?error=profile_lookup_failed");
  if (!profile?.is_admin) redirect("/");

  return { supabase, user };
}

