import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/dashboard";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { supabase } = await requireAdmin();
  const { slug } = await params;

  const { data: evt, error: evtErr } = await supabase
    .from("ingest_events")
    .select("id,slug,title,is_paused,next_day,last_success_day,batch_days,daily_total,daily_media,daily_video,updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (evtErr) {
    return NextResponse.json({ ok: false, error: evtErr.message }, { status: 500 });
  }
  if (!evt) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { data: runs, error: runsErr } = await supabase
    .from("ingest_runs")
    .select("id,started_at,ended_at,status,range_from,range_to,totals,error")
    .eq("event_id", evt.id)
    .order("started_at", { ascending: false })
    .limit(10);
  if (runsErr) {
    return NextResponse.json({ ok: false, error: runsErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event: evt, runs: runs ?? [] });
}

