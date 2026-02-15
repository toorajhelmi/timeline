import { createSupabaseServerClient } from "../supabase/server";

import type { Timeline } from "../db/types";

export async function listPublicTimelines(params: { q?: string }) {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("timelines")
    .select(
      "id,slug,title,description,tags,visibility,created_by,created_at,updated_at,canonical_timeline_id,theme_primary,theme_secondary,theme_text",
    )
    .eq("visibility", "public")
    .is("canonical_timeline_id", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (params.q) {
    const q = params.q.trim();
    if (q) {
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Timeline[];
}

export async function getTimelineBySlug(slug: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("timelines")
    .select(
      "id,slug,title,description,tags,visibility,created_by,created_at,updated_at,canonical_timeline_id,theme_primary,theme_secondary,theme_text",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Timeline | null;
}

export async function getTimelineById(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("timelines")
    .select(
      "id,slug,title,description,tags,visibility,created_by,created_at,updated_at,canonical_timeline_id,theme_primary,theme_secondary,theme_text",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Timeline | null;
}

