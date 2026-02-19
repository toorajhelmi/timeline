import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { hasPublicSupabaseEnv } from "@/lib/env";
import { env } from "@/lib/env";
import { getTimelineBySlug } from "@/lib/data/timelines";
import {
  getEntryById,
  listComments,
  listMedia,
  listSources,
} from "@/lib/data/entries";
import { formatUtcTime } from "@/lib/utils/time";
import { isProbablyRtl } from "@/lib/utils/rtl";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { detectMediaFromResolvedMedia } from "@/lib/utils/media";
import TimelineEntryMedia from "@/components/timelines/TimelineEntryMedia";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import SharePanel from "@/components/entries/detail/SharePanel";
import ShareMenu from "@/components/share/ShareMenu";
import { getSiteUrl } from "@/lib/site";
import EntryMediaLiveRefreshClient from "@/components/entries/detail/EntryMediaLiveRefreshClient";

function truncate(s: string, n: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1)).trimEnd()}…`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug, id } = await params;
  const siteUrl = getSiteUrl();
  const canonicalUrl = `${siteUrl}/timelines/${encodeURIComponent(slug)}/entries/${encodeURIComponent(id)}`;

  try {
    const [timeline, entry] = await Promise.all([getTimelineBySlug(slug), getEntryById(id)]);
    if (!timeline || !entry || entry.timeline_id !== timeline.id) {
      return { title: "Rekord", alternates: { canonical: canonicalUrl } };
    }

    const cleanedBody = stripAutoCollectedBoilerplate(entry.body);
    const title = entry.title?.trim() || truncate(cleanedBody, 90) || "Rekord";
    const description =
      truncate(cleanedBody, 220) ||
      `View this post on Rekord: ${timeline.title}`;

    // Best-effort: pick a first image if available.
    const mediaRows = await listMedia(entry.id);
    const firstImage = (mediaRows ?? []).find((m) => m.kind === "image") ?? null;
    const ogImages = firstImage
      ? [
          {
            url: `${env.supabaseUrl}/storage/v1/object/public/${firstImage.storage_bucket}/${firstImage.storage_path}`,
          },
        ]
      : [];

    return {
      title,
      description,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        type: "article",
        url: canonicalUrl,
        title,
        description,
        siteName: "Rekord",
        images: ogImages,
      },
      twitter: {
        card: ogImages.length ? "summary_large_image" : "summary",
        title,
        description,
        images: ogImages.map((i) => i.url),
      },
    };
  } catch {
    return { title: "Rekord", alternates: { canonical: canonicalUrl } };
  }
}

function stripAutoCollectedBoilerplate(body: string): string {
  const POSTER_HANDLE_RE = /^\s*@?ill?iaen@?\s*$/i;
  const POSTER_PREFIX_RE = /^\s*@?ill?iaen@?\s*[:\-–—]?\s*/i;

  const lines = body
    .split("\n")
    .map((l) => l.trim())
    // Remove known poster handle prefixes like "illiaen@".
    .map((l) => l.replace(POSTER_PREFIX_RE, "").trim())
    .filter(Boolean);

  const filtered = lines.filter((l) => {
    const s = l.toLowerCase();
    // Remove poster handle lines like "@iliaen" / "illiaen@".
    if (POSTER_HANDLE_RE.test(s)) return false;
    if (s.startsWith("auto-collected:")) return false;
    if (s.startsWith("auto collected:")) return false;
    if (s.startsWith("auto-collected article")) return false;
    if (s.startsWith("domain:")) return false;
    if (s.startsWith("source country:")) return false;
    if (s.startsWith("note: this entry is auto-collected")) return false;
    if (s.startsWith("telegram message")) return false;
    return true;
  });

  return filtered.join("\n");
}

async function addComment(formData: FormData) {
  "use server";

  if (!hasPublicSupabaseEnv()) redirect("/");

  const slug = String(formData.get("slug") ?? "");
  const entryId = String(formData.get("entry_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!slug || !entryId) redirect("/");
  if (!body) redirect(`/timelines/${slug}/entries/${entryId}?error=missing_comment`);

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/timelines/${slug}/entries/${entryId}`)}`);
  }

  const { error } = await supabase.from("comments").insert({
    entry_id: entryId,
    body,
    created_by: user.id,
  });
  if (error) redirect(`/timelines/${slug}/entries/${entryId}?error=${encodeURIComponent(error.message)}`);

  redirect(`/timelines/${slug}/entries/${entryId}`);
}

async function reportEntry(formData: FormData) {
  "use server";

  if (!hasPublicSupabaseEnv()) redirect("/");

  const slug = String(formData.get("slug") ?? "");
  const entryId = String(formData.get("entry_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!slug || !entryId) redirect("/");
  if (!reason) redirect(`/timelines/${slug}/entries/${entryId}?error=missing_report_reason`);

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/timelines/${slug}/entries/${entryId}`)}`);
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    object_type: "entry",
    object_id: entryId,
    reason,
  });

  if (error) redirect(`/timelines/${slug}/entries/${entryId}?error=${encodeURIComponent(error.message)}`);
  redirect(`/timelines/${slug}/entries/${entryId}?reported=1`);
}

async function setPinned(formData: FormData) {
  "use server";

  if (!hasPublicSupabaseEnv()) redirect("/");

  const slug = String(formData.get("slug") ?? "");
  const entryId = String(formData.get("entry_id") ?? "");
  const next = String(formData.get("pinned") ?? "") === "true";
  if (!slug || !entryId) redirect("/");

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/timelines/${slug}/entries/${entryId}`)}`);
  }

  const { data: timeline, error: tErr } = await supabase
    .from("timelines")
    .select("id,created_by")
    .eq("slug", slug)
    .maybeSingle();
  if (tErr || !timeline) redirect(`/timelines/${slug}/entries/${entryId}?error=timeline_not_found`);
  if (timeline.created_by !== user.id) redirect(`/timelines/${slug}/entries/${entryId}?error=not_owner`);

  const service = createSupabaseServiceClient();
  if (!service) redirect(`/timelines/${slug}/entries/${entryId}?error=missing_service_role`);

  if (next) {
    await service.from("timeline_key_moments").insert({
      timeline_id: timeline.id,
      entry_id: entryId,
      pinned_by: user.id,
    });
  } else {
    await service
      .from("timeline_key_moments")
      .delete()
      .eq("timeline_id", timeline.id)
      .eq("entry_id", entryId);
  }

  redirect(`/timelines/${slug}/entries/${entryId}`);
}

export const dynamic = "force-dynamic";

export default async function EntryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams?: Promise<{ error?: string; reported?: string }>;
}) {
  const { slug, id } = await params;

  if (!hasPublicSupabaseEnv()) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <main className="mx-auto w-full max-w-3xl">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            Configure Supabase env vars to load entries.
          </div>
        </main>
      </div>
    );
  }

  const timeline = await getTimelineBySlug(slug);
  if (!timeline) notFound();

  const entry = await getEntryById(id);
  if (!entry || entry.timeline_id !== timeline.id) notFound();

  const [sources, comments, mediaRows] = await Promise.all([
    listSources(entry.id),
    listComments(entry.id),
    listMedia(entry.id),
  ]);

  // Prefer full/original media when available on the detail page.
  // (Timeline view may prefer previews for performance, but the entry page should upgrade
  // from the 1‑min preview to the full video as soon as it's uploaded.)
  const images = (mediaRows ?? []).filter((m) => m.kind === "image");
  const videos = (mediaRows ?? []).filter((m) => m.kind === "video");
  const audios = (mediaRows ?? []).filter((m) => m.kind === "audio");

  const chosenImage = images.find((m) => m.variant === "poster") ?? images[0] ?? null;
  const chosenVideo =
    videos.find((m) => m.variant === "optimized") ??
    videos.find((m) => m.variant === "preview") ??
    videos[0] ??
    null;
  const chosenAudio = audios[0] ?? null;

  const mediaItems = ([chosenImage, chosenVideo, chosenAudio] as const)
    .filter(Boolean)
    .map((m) => ({
      kind: m!.kind as "image" | "video" | "audio",
      url: `${env.supabaseUrl}/storage/v1/object/public/${m!.storage_bucket}/${m!.storage_path}`,
    }));

  const media =
    mediaItems.length > 0 ? detectMediaFromResolvedMedia(mediaItems) : { kind: "none" as const };

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  const isOwner = Boolean(user?.id && user.id === timeline.created_by);

  const service = createSupabaseServiceClient();
  const { data: pinnedRow } =
    service && isOwner
      ? await service
          .from("timeline_key_moments")
          .select("entry_id")
          .eq("timeline_id", timeline.id)
          .eq("entry_id", entry.id)
          .maybeSingle()
      : { data: null };
  const isPinned = Boolean(pinnedRow?.entry_id);

  const sp = (await searchParams) ?? {};
  const error = sp.error;
  const reported = sp.reported === "1";
  // Don't fall back to the original body if stripping removes everything;
  // otherwise placeholders like "Telegram message." reappear.
  const displayBody = stripAutoCollectedBoilerplate(entry.body);
  const titleDir: "rtl" | "ltr" = entry.title && isProbablyRtl(entry.title) ? "rtl" : "ltr";
  const bodyDir: "rtl" | "ltr" = displayBody && isProbablyRtl(displayBody) ? "rtl" : "ltr";

  return (
    <div className="dark min-h-screen bg-zinc-950 px-6 py-14 text-zinc-50">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <EntryMediaLiveRefreshClient entryId={entry.id} />
        <header className="flex flex-col gap-2">
          <Link
            className="text-sm font-medium text-zinc-300 hover:underline"
            href={`/timelines/${timeline.slug}`}
          >
            ← {timeline.title}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-200">
              {entry.type === "call_to_action"
                ? "action"
                : entry.type === "claim"
                  ? "opinion"
                  : entry.type === "evidence"
                    ? "moment"
                    : entry.type}
            </span>
            <span className="text-xs text-zinc-400">
              {formatUtcTime(entry.time_start)}
            </span>
            <ShareMenu
              path={`/timelines/${timeline.slug}/entries/${entry.id}`}
              title={entry.title ?? null}
              body={displayBody}
              variant="button"
            />
            {entry.status !== "active" && (
              <span className="text-xs text-amber-300">
                {entry.status}
              </span>
            )}
            {isOwner ? (
              <form action={setPinned} className="ml-1">
                <input type="hidden" name="slug" value={timeline.slug} />
                <input type="hidden" name="entry_id" value={entry.id} />
                <input type="hidden" name="pinned" value={String(!isPinned)} />
                <button
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                    isPinned
                      ? "border-amber-300/40 bg-amber-400/15 text-amber-200 hover:bg-amber-400/20"
                      : "border-zinc-700 bg-zinc-950/30 text-zinc-200 hover:bg-zinc-900/60"
                  }`}
                  type="submit"
                >
                  <span aria-hidden>{isPinned ? "★" : "☆"}</span>
                  {isPinned ? "Pinned" : "Pin"}
                </button>
              </form>
            ) : null}
          </div>
          {entry.title ? (
            <h1
              className={`text-2xl font-semibold tracking-tight ${titleDir === "rtl" ? "text-right" : ""}`}
              dir={titleDir}
            >
              {entry.title}
            </h1>
          ) : null}
        </header>

        <SharePanel
          fallbackPath={`/timelines/${timeline.slug}/entries/${entry.id}`}
          title={entry.title ?? null}
          body={displayBody}
        />

        <section className="rounded-2xl bg-zinc-900 p-6">
          <TimelineEntryMedia
            media={media}
            heightClassName="h-56"
            shape="rounded"
            entryId={entry.id}
            variant="detail"
          />
          <div
            className={`whitespace-pre-wrap text-sm leading-7 text-zinc-200 ${
              bodyDir === "rtl" ? "text-right" : ""
            }`}
            dir={bodyDir}
          >
            {displayBody}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-sm font-semibold">Sources</h2>
          {sources.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {sources.map((s) => (
                <li key={s.id}>
                  <a
                    className="break-all text-zinc-100 underline hover:no-underline"
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.url}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">
              No sources attached.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold">Discussion</h2>
            {!user && (
              <Link
                className="text-sm font-medium text-zinc-300 underline hover:no-underline"
                href="/auth/login"
              >
                Sign in to comment
              </Link>
            )}
          </div>

          {entry.is_locked && (
            <div className="mt-4 rounded-xl border border-amber-900/40 bg-amber-950/30 p-3 text-sm text-amber-200">
              Discussion is locked for this entry.
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-rose-900/40 bg-rose-950/30 p-3 text-sm text-rose-200">
              <span className="font-medium">{error}</span>
            </div>
          )}

          {reported && (
            <div className="mt-4 rounded-xl border border-emerald-900/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">
              Report submitted.
            </div>
          )}

          {user && !entry.is_locked && (
            <form action={addComment} className="mt-4 space-y-3">
              <input type="hidden" name="slug" value={timeline.slug} />
              <input type="hidden" name="entry_id" value={entry.id} />
              <textarea
                className="w-full resize-none rounded-xl border border-zinc-700 bg-transparent px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-zinc-600"
                name="body"
                rows={3}
                placeholder="Add a comment…"
                required
              />
              <button className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200">
                Post comment
              </button>
            </form>
          )}

          <div className="mt-6 space-y-3">
            {comments.length ? (
              comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm"
                >
                  <div className="text-xs text-zinc-400">
                    {new Date(c.created_at).toISOString()}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-zinc-200">
                    {c.body}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-400">
                No comments yet.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-sm font-semibold">Report</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Report harassment, doxxing, threats, or other policy violations.
          </p>
          {user ? (
            <form action={reportEntry} className="mt-4 space-y-3">
              <input type="hidden" name="slug" value={timeline.slug} />
              <input type="hidden" name="entry_id" value={entry.id} />
              <textarea
                className="w-full resize-none rounded-xl border border-zinc-700 bg-transparent px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-zinc-600"
                name="reason"
                rows={3}
                placeholder="Why are you reporting this entry?"
                required
              />
              <button className="inline-flex items-center justify-center rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800">
                Submit report
              </button>
            </form>
          ) : (
            <Link
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
              href="/auth/login"
            >
              Sign in to report
            </Link>
          )}
        </section>
      </main>
    </div>
  );
}

