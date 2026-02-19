import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

async function requireOwner(slug: string) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { ok: false as const, status: 401, error: "not_authenticated" };
  }

  const { data: timeline, error } = await supabase
    .from("timelines")
    .select("id,created_by")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!timeline) return { ok: false as const, status: 404, error: "not_found" };
  if (timeline.created_by !== user.id) {
    return { ok: false as const, status: 403, error: "not_owner" };
  }

  const service = createSupabaseServiceClient();
  if (!service) return { ok: false as const, status: 500, error: "missing_service_role" };

  return { ok: true as const, userId: user.id, timelineId: timeline.id, service };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const j = (await req.json().catch(() => null)) as { entryId?: string } | null;
  const entryId = String(j?.entryId ?? "").trim();
  if (!entryId) return NextResponse.json({ ok: false, error: "missing_entry_id" }, { status: 400 });

  const auth = await requireOwner(slug);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  // Idempotent-ish insert: ignore duplicates.
  const r = await auth.service.from("timeline_key_moments").insert({
    timeline_id: auth.timelineId,
    entry_id: entryId,
    pinned_by: auth.userId,
  });
  if (r.error && !String(r.error.message ?? "").toLowerCase().includes("duplicate")) {
    return NextResponse.json({ ok: false, error: r.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const j = (await req.json().catch(() => null)) as { entryId?: string } | null;
  const entryId = String(j?.entryId ?? "").trim();
  if (!entryId) return NextResponse.json({ ok: false, error: "missing_entry_id" }, { status: 400 });

  const auth = await requireOwner(slug);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const r = await auth.service
    .from("timeline_key_moments")
    .delete()
    .eq("timeline_id", auth.timelineId)
    .eq("entry_id", entryId);
  if (r.error) return NextResponse.json({ ok: false, error: r.error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

