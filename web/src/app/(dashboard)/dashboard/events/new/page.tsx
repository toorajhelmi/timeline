import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/dashboard";

export const dynamic = "force-dynamic";

async function createEvent(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const slug = String(formData.get("slug") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const startDay = String(formData.get("start_day") ?? "").trim(); // YYYY-MM-DD
  const source = String(formData.get("source") ?? "gdelt_doc_api").trim();
  const query = String(formData.get("source_query") ?? "").trim();
  const telegramChannel = String(formData.get("telegram_channel") ?? "").trim();
  const telegramOnlyMedia = String(formData.get("telegram_only_media") ?? "") === "1";

  const dailyTotal = Number(formData.get("daily_total") ?? 20);
  const dailyMedia = Number(formData.get("daily_media") ?? 8);
  const dailyVideo = Number(formData.get("daily_video") ?? 2);
  const batchDays = Number(formData.get("batch_days") ?? 5);

  // Keep it simple: one slug. Internally we use it as the timeline slug too.
  const timelineSlug = slug;

  if (!slug || !title || !startDay) {
    redirect("/dashboard/events/new?error=missing_required");
  }

  if (source === "telegram_channel" && !telegramChannel) {
    redirect("/dashboard/events/new?error=missing_telegram_channel");
  }

  const { error } = await supabase.from("ingest_events").insert({
    slug,
    title,
    description: "",
    source: source === "telegram_channel" ? "telegram_channel" : "gdelt_doc_api",
    source_query: source === "gdelt_doc_api" ? query : "",
    source_config:
      source === "telegram_channel"
        ? {
            channel: telegramChannel,
            only_media: telegramOnlyMedia,
          }
        : {},
    timeline_slug: timelineSlug,
    start_day: startDay,
    next_day: startDay,
    daily_total: dailyTotal,
    daily_media: dailyMedia,
    daily_video: dailyVideo,
    batch_days: batchDays,
    is_paused: true, // safety: created paused by default
  });

  if (error) {
    redirect(`/dashboard/events/new?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/dashboard/events/${slug}`);
}

export default async function AdminNewEventPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  try {
    await requireAdmin({ nextPath: "/dashboard/events/new" });
  } catch (e) {
    // Don't swallow redirects (login/admin-only).
    if (String((e as any)?.digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <main className="mx-auto w-full max-w-2xl">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            Set <code>SUPABASE_SERVICE_ROLE_KEY</code> on the server to use admin
            ingestion pages.
            <div className="mt-2 text-xs opacity-90">
              {String((e as Error)?.message ?? e)}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const sp = (await searchParams) ?? {};
  const error = sp.error;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">New ingest event</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Events are created paused by default. Start collection only when ready.
          </p>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        <form
          action={createEvent}
          className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="grid gap-4">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Slug</span>
              <input
                name="slug"
                placeholder="iran-uprise-2026"
                className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                required
              />
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                This will also be the timeline URL: <code>/t/{`{slug}`}</code>
              </span>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-medium">Title</span>
              <input
                name="title"
                placeholder="Iran Uprise (2026)"
                className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                required
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-medium">Start day</span>
              <input
                name="start_day"
                placeholder="2025-12-27"
                className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                required
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-medium">Source</span>
              <select
                name="source"
                className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                defaultValue="gdelt_doc_api"
              >
                <option value="gdelt_doc_api">GDELT (news)</option>
                <option value="telegram_channel">Telegram channel</option>
              </select>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                Telegram requires env vars on the server: <code>TELEGRAM_API_ID</code>,{" "}
                <code>TELEGRAM_API_HASH</code>, <code>TELEGRAM_PHONE</code>.
              </span>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-medium">GDELT query (optional)</span>
              <textarea
                name="source_query"
                placeholder="(Iran OR Iranian OR Tehran) (protest OR protests OR uprising ...)"
                className="min-h-[90px] resize-none rounded-xl border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
              />
            </label>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
              <div className="font-medium">Telegram channel settings</div>
              <div className="mt-3 grid gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Channel</span>
                  <input
                    name="telegram_channel"
                    placeholder="@iliaen or https://t.me/iliaen"
                    className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                  />
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    Must be a channel you can access.
                  </span>
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="telegram_only_media"
                    value="1"
                    defaultChecked
                    className="h-4 w-4 rounded border-zinc-300 bg-transparent text-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
                  />
                  <span>Only ingest messages with media (recommended)</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Daily total</span>
                <input
                  name="daily_total"
                  type="number"
                  defaultValue={20}
                  min={1}
                  className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Batch days</span>
                <input
                  name="batch_days"
                  type="number"
                  defaultValue={5}
                  min={1}
                  max={14}
                  className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Daily media</span>
                <input
                  name="daily_media"
                  type="number"
                  defaultValue={8}
                  min={0}
                  className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Daily video</span>
                <input
                  name="daily_video"
                  type="number"
                  defaultValue={2}
                  min={0}
                  className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                />
              </label>
            </div>

            <button className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
              Create event (paused)
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

