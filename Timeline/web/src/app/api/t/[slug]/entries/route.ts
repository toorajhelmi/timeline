import { NextResponse } from "next/server";

import { env } from "../../../../../lib/env";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type MediaItem = { kind: "image" | "video" | "audio"; url: string };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const typeRaw = url.searchParams.get("type") ?? undefined;
  const type =
    typeRaw === "claim" || typeRaw === "evidence" || typeRaw === "call_to_action"
      ? typeRaw
      : undefined;
  const after = url.searchParams.get("after") ?? undefined;
  const limitRaw = Number(url.searchParams.get("limit") ?? 200);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 200;

  if (!from || !to) {
    return NextResponse.json(
      { ok: false, error: "missing_from_to" },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();

  const { data: timeline, error: tErr } = await supabase
    .from("timelines")
    .select("id,slug,visibility,canonical_timeline_id")
    .eq("slug", slug)
    .maybeSingle();
  if (tErr) {
    return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });
  }
  if (!timeline) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let q = supabase
    .from("entries")
    .select(
      "id,timeline_id,type,title,body,time_start,time_end,status,is_locked,corrects_entry_id,created_by,created_at,updated_at",
    )
    .eq("timeline_id", timeline.id)
    .gte("time_start", from)
    .lte("time_start", to)
    .order("time_start", { ascending: true })
    .limit(limit);

  if (type) q = q.eq("type", type);
  if (after) q = q.gt("time_start", after);

  const { data: entries, error: eErr } = await q;
  if (eErr) {
    return NextResponse.json({ ok: false, error: eErr.message }, { status: 500 });
  }

  const ids = (entries ?? []).map((e) => e.id);

  // sources
  const sourcesByEntryId: Record<string, any[]> = {};
  if (ids.length) {
    const { data: sources, error: sErr } = await supabase
      .from("sources")
      .select("id,entry_id,url,source_type,added_by,created_at")
      .in("entry_id", ids)
      .order("created_at", { ascending: true });
    if (sErr) {
      return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
    }
    for (const s of sources ?? []) {
      const list = sourcesByEntryId[s.entry_id] ?? [];
      list.push(s);
      sourcesByEntryId[s.entry_id] = list;
    }
  }

  // media
  const mediaByEntryId: Record<string, MediaItem[]> = {};
  if (ids.length) {
  const { data: mediaRows, error: mErr } = await supabase
      .from("entry_media")
      .select("id,entry_id,kind,storage_bucket,storage_path,variant")
      .in("entry_id", ids)
      .order("created_at", { ascending: true });
    if (mErr) {
      return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });
    }
    for (const m of mediaRows ?? []) {
      if (m.kind !== "image" && m.kind !== "video" && m.kind !== "audio") continue;
      const list = mediaByEntryId[m.entry_id] ?? [];
      list.push({
        kind: m.kind,
        variant: m.variant ?? "original",
        url: `${env.supabaseUrl}/storage/v1/object/public/${m.storage_bucket}/${m.storage_path}`,
      } as any);
      mediaByEntryId[m.entry_id] = list;
    }
  }

  // Prefer low-res preview videos on the timeline list to reduce loading time.
  for (const [entryId, list] of Object.entries(mediaByEntryId)) {
    const images = list.filter((m: any) => m.kind === "image");
    const audios = list.filter((m: any) => m.kind === "audio");
    const videos = list.filter((m: any) => m.kind === "video");
    const chosenVideo =
      videos.find((v: any) => v.variant === "preview") ?? videos[0] ?? null;
    mediaByEntryId[entryId] = [
      ...(images[0] ? [images[0] as any] : []),
      ...(chosenVideo ? [chosenVideo as any] : []),
      ...(audios[0] ? [audios[0] as any] : []),
    ].map(({ kind, url }: any) => ({ kind, url }));
  }

  return NextResponse.json({
    ok: true,
    entries: entries ?? [],
    sourcesByEntryId,
    mediaByEntryId,
    hasMore: (entries ?? []).length === limit,
    nextAfter: (entries ?? []).length ? entries![entries!.length - 1]!.time_start : null,
  });
}

