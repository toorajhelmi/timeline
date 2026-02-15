import { createSupabaseServerClient } from "../supabase/server";

import type { Comment, Entry, EntryMedia, EntryType, Source } from "../db/types";

export async function getFirstEntryTimeStart(timelineId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("entries")
    .select("time_start")
    .eq("timeline_id", timelineId)
    .order("time_start", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.time_start ?? null) as string | null;
}

export async function listEntries(params: {
  timelineId: string;
  fromIso: string;
  toIso: string;
  type?: EntryType;
  limit?: number;
  afterIso?: string;
  order?: "asc" | "desc";
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
    .order("time_start", { ascending: (params.order ?? "desc") === "asc" })
    .limit(params.limit ?? 500);

  if (params.type) query = query.eq("type", params.type);
  if (params.afterIso) {
    if ((params.order ?? "desc") === "asc") query = query.gt("time_start", params.afterIso);
    else query = query.lt("time_start", params.afterIso);
  }

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
  // IMPORTANT: batching prevents URL/header overflow when entryIds is large.
  const CHUNK = 100;
  const all: Source[] = [];
  for (let i = 0; i < entryIds.length; i += CHUNK) {
    const chunk = entryIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("sources")
      .select("id,entry_id,url,source_type,added_by,created_at")
      .in("entry_id", chunk)
      .order("created_at", { ascending: true });
    if (error) throw error;
    all.push(...((data ?? []) as Source[]));
  }

  const map = new Map<string, Source[]>();
  for (const s of all) {
    const list = map.get(s.entry_id);
    if (list) list.push(s);
    else map.set(s.entry_id, [s]);
  }
  return map;
}

export async function listMedia(entryId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("entry_media")
    .select("id,entry_id,kind,storage_bucket,storage_path,variant,created_at")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EntryMedia[];
}

export async function listMediaForEntries(entryIds: string[]) {
  if (entryIds.length === 0) return new Map<string, EntryMedia[]>();

  const supabase = await createSupabaseServerClient();
  // IMPORTANT: batching prevents URL/header overflow when entryIds is large.
  const CHUNK = 80;
  const all: EntryMedia[] = [];
  for (let i = 0; i < entryIds.length; i += CHUNK) {
    const chunk = entryIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("entry_media")
      .select("id,entry_id,kind,storage_bucket,storage_path,variant,created_at")
      .in("entry_id", chunk)
      .order("created_at", { ascending: true });
    if (error) throw error;
    all.push(...((data ?? []) as EntryMedia[]));
  }

  const map = new Map<string, EntryMedia[]>();
  for (const m of all) {
    const list = map.get(m.entry_id);
    if (list) list.push(m);
    else map.set(m.entry_id, [m]);
  }
  return map;
}

