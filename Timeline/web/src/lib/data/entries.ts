import { createSupabaseServerClient } from "../supabase/server";

import type { Comment, Entry, EntryType, Source } from "../db/types";

export async function listEntries(params: {
  timelineId: string;
  fromIso: string;
  toIso: string;
  type?: EntryType;
  limit?: number;
}) {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("entries")
    .select(
      "id,timeline_id,type,title,body,time_start,time_end,status,is_locked,corrects_entry_id,created_by,created_at,updated_at",
    )
    .eq("timeline_id", params.timelineId)
    .gte("time_start", params.fromIso)
    .lte("time_start", params.toIso)
    .order("time_start", { ascending: false })
    .limit(params.limit ?? 500);

  if (params.type) query = query.eq("type", params.type);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Entry[];
}

export async function getEntryById(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("entries")
    .select(
      "id,timeline_id,type,title,body,time_start,time_end,status,is_locked,corrects_entry_id,created_by,created_at,updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Entry | null;
}

export async function listSources(entryId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sources")
    .select("id,entry_id,url,source_type,added_by,created_at")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Source[];
}

export async function listComments(entryId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("comments")
    .select("id,entry_id,body,status,created_by,created_at,updated_at")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Comment[];
}

export async function listKeyMoments(timelineId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("timeline_key_moments")
    .select(
      "created_at, entry:entries(id,timeline_id,type,title,body,time_start,time_end,status,is_locked,corrects_entry_id,created_by,created_at,updated_at)",
    )
    .eq("timeline_id", timelineId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  type KeyMomentRow = { created_at: string; entry: Entry | null };
  const moments = ((data ?? []) as unknown as KeyMomentRow[])
    .map((row) => row.entry)
    .filter((e): e is Entry => Boolean(e));

  return moments;
}

export async function listSourcesForEntries(entryIds: string[]) {
  if (entryIds.length === 0) return new Map<string, Source[]>();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sources")
    .select("id,entry_id,url,source_type,added_by,created_at")
    .in("entry_id", entryIds)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const map = new Map<string, Source[]>();
  for (const s of (data ?? []) as Source[]) {
    const list = map.get(s.entry_id);
    if (list) list.push(s);
    else map.set(s.entry_id, [s]);
  }
  return map;
}

