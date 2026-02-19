import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { spawn } from "node:child_process";
import path from "node:path";

import { requireAdmin } from "@/lib/auth/dashboard";
import { RunProgressClient } from "@/components/dashboard/events/RunProgressClient";

export const dynamic = "force-dynamic";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function num(x: any, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

async function setPaused(formData: FormData) {
  "use server";
  const { supabase } = await requireAdmin();
  const slug = String(formData.get("slug") ?? "");
  const paused = String(formData.get("paused") ?? "") === "1";
  if (!slug) redirect("/dashboard/events");

  const { data: evt, error: evtErr } = await supabase
    .from("ingest_events")
    .select("id,slug,is_paused,source,source_config,start_day")
    .eq("slug", slug)
    .maybeSingle();
  if (evtErr) redirect(`/dashboard/events/${slug}?error=${encodeURIComponent(evtErr.message)}`);
  if (!evt) redirect(`/dashboard/events/${slug}?error=${encodeURIComponent("event_not_found")}`);

  // If unpausing, kick off one batch immediately (local dev).
  // The batch script will pause the event again when the batch completes.
  if (!paused) {
    // Telegram ingestion doesn't use ingest_runs yet; for now we only gate GDELT runs.
    const isTelegram = evt.source === "telegram_channel";
    if (!isTelegram) {
    const { data: runningRows, error: runningErr } = await supabase
      .from("ingest_runs")
      .select("id,started_at,totals")
      .eq("event_id", evt.id)
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1);
    if (runningErr)
      redirect(`/dashboard/events/${slug}?error=${encodeURIComponent(runningErr.message)}`);
    const running = (runningRows ?? [])[0] as any;
    if (running?.id) {
      const lastUpdateAt = running?.totals?.last_update_at
        ? new Date(String(running.totals.last_update_at)).valueOf()
        : NaN;
      const ageMs = Number.isFinite(lastUpdateAt) ? Date.now() - lastUpdateAt : Number.POSITIVE_INFINITY;

      // If there's an actively updating run, don't start another.
      if (ageMs < 25_000) {
        await supabase.from("ingest_events").update({ is_paused: false }).eq("id", evt.id);
        redirect(`/dashboard/events/${slug}`);
      }

      // Otherwise treat it as stale (common after crashes) and clear it so "Unpause" starts ingestion.
      await supabase
        .from("ingest_runs")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          error: "stale running run cleared by admin (no heartbeat)",
        })
        .eq("id", running.id);
    }
    }
  }

  const { error } = await supabase
    .from("ingest_events")
    .update({ is_paused: paused })
    .eq("id", evt.id);
  if (error) redirect(`/dashboard/events/${slug}?error=${encodeURIComponent(error.message)}`);

  if (!paused) {
    const isTelegram = evt.source === "telegram_channel";
    const scriptPath = isTelegram
      ? path.join(process.cwd(), "scripts", "ingest-telegram-channel.mjs")
      : path.join(process.cwd(), "scripts", "run-ingest-batch.mjs");

    const args = isTelegram
      ? [
          scriptPath,
          "--timeline-slug",
          slug,
          "--channel",
          String(evt.source_config?.channel ?? ""),
          "--from",
          String(evt.start_day),
          ...(evt.source_config?.only_media ? ["--only-media"] : []),
        ].filter(Boolean)
      : [scriptPath, "--event-slug", slug];

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();

    if (!isTelegram) {
      // Quick self-check: if no run appears soon, it likely failed to start.
      // In that case, re-pause and show a clear error instead of silently doing nothing.
      await sleep(900);
      const { data: runningNow, error: rErr } = await supabase
        .from("ingest_runs")
        .select("id")
        .eq("event_id", evt.id)
        .eq("status", "running")
        .limit(1);
      if (rErr || !(runningNow ?? []).length) {
        await supabase.from("ingest_events").update({ is_paused: true }).eq("id", evt.id);
        redirect(
          `/dashboard/events/${slug}?error=${encodeURIComponent(
            "Failed to start ingestion locally. Ensure the dev server can spawn Node processes and that SUPABASE_SERVICE_ROLE_KEY is set (web/.env.local). You can still run: node ./scripts/run-ingest-batch.mjs --event-slug " +
              slug,
          )}`,
        );
      }
    }
  }

  redirect(`/dashboard/events/${slug}`);
}

export default async function AdminEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  let supabase;
  try {
    ({ supabase } = await requireAdmin());
  } catch (e) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <main className="mx-auto w-full max-w-3xl">
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
  const { slug } = await params;

  const { data: evt, error } = await supabase.from("ingest_events").select("*").eq("slug", slug).maybeSingle();
  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <main className="mx-auto w-full max-w-3xl">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            Failed to load event: {error.message}
          </div>
        </main>
      </div>
    );
  }
  if (!evt) notFound();

  const { data: runs } = await supabase
    .from("ingest_runs")
    .select("id,started_at,ended_at,status,range_from,range_to,totals,error")
    .eq("event_id", evt.id)
    .order("started_at", { ascending: false })
    .limit(20);

  const sp = (await searchParams) ?? {};
  const pageError = sp.error;

  const runList = runs ?? [];
  const runningCount = runList.filter((r) => r.status === "running").length;
  const successCount = runList.filter((r) => r.status === "success").length;
  const failedCount = runList.filter((r) => r.status === "failed").length;

  const summed = runList.reduce(
    (acc, r) => {
      const t: any = r.totals ?? {};
      acc.entries += num(t.entries);
      acc.media += num(t.media);
      acc.videos += num(t.videos);
      acc.images += num(t.images);
      acc.days += num(t.days);
      return acc;
    },
    { entries: 0, media: 0, videos: 0, images: 0, days: 0 },
  );

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <Link className="text-sm text-zinc-600 underline hover:no-underline dark:text-zinc-400" href="/dashboard/events">
              ← Ingestion
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{evt.title}</h1>
            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{evt.slug}</div>
          </div>
          <Link
            href={`/timelines/${evt.slug}`}
            className="inline-flex items-center justify-center rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            View timeline
          </Link>
        </header>

        {pageError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {pageError}
          </div>
        ) : null}

        <RunProgressClient slug={evt.slug} />

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid gap-2 text-sm">
            <div>
              <span className="font-medium">Start day:</span> {evt.start_day}
            </div>
            <div>
              <span className="font-medium">Next day:</span> {evt.next_day}
            </div>
            <div>
              <span className="font-medium">Last success:</span> {evt.last_success_day ?? "—"}
            </div>
            <div>
              <span className="font-medium">Targets/day:</span> {evt.daily_total} total / {evt.daily_media} media / {evt.daily_video} video
            </div>
            <div>
              <span className="font-medium">Batch size:</span> {evt.batch_days} days
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <form action={setPaused}>
              <input type="hidden" name="slug" value={evt.slug} />
              <input type="hidden" name="paused" value={evt.is_paused ? "0" : "1"} />
              <button className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                {evt.is_paused ? "Unpause" : "Pause"}
              </button>
            </form>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              Running a batch is done from CLI with `run-ingest-batch.mjs`.
            </div>
          </div>
        </section>

        <details className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <summary className="cursor-pointer select-none text-sm font-semibold">
            Historic report{" "}
            <span className="ml-2 text-xs font-normal text-zinc-600 dark:text-zinc-400">
              ({successCount} success · {failedCount} failed · {runningCount} running)
            </span>
          </summary>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-xs text-zinc-600 dark:text-zinc-400">Last 20 runs (sum)</div>
              <div className="mt-1">
                <span className="font-medium">{summed.entries}</span> entries
              </div>
              <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                {summed.media} media · {summed.videos} videos · {summed.images} images · {summed.days} days
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-xs text-zinc-600 dark:text-zinc-400">Checkpoint</div>
              <div className="mt-1 text-sm">
                Next day: <span className="font-medium">{evt.next_day}</span>
              </div>
              <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                Last success: {evt.last_success_day ?? "—"}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-xs text-zinc-600 dark:text-zinc-400">Targets</div>
              <div className="mt-1 text-sm">
                {evt.daily_total} total / {evt.daily_media} media / {evt.daily_video} video
              </div>
              <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">Batch: {evt.batch_days} days</div>
            </div>
          </div>

          <h3 className="mt-6 text-sm font-semibold">Runs</h3>
          {runList.length ? (
            <div className="mt-3 space-y-3">
              {runList.map((r) => {
                const t: any = r.totals ?? {};
                const lastDay = t?.last_day ?? null;
                const lastStats = t?.last_day_stats ?? null;
                return (
                  <details
                    key={r.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <summary className="cursor-pointer select-none">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">
                          {r.range_from} → {r.range_to}
                        </div>
                        <div className="text-xs text-zinc-600 dark:text-zinc-400">{r.status}</div>
                      </div>
                      <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {r.started_at}
                        {r.ended_at ? ` → ${r.ended_at}` : ""}
                        <span className="mx-2 opacity-50">·</span>
                        {num(t.entries)} entries · {num(t.media)} media · {num(t.videos)} videos · {num(t.days)} days
                        {lastDay ? (
                          <>
                            <span className="mx-2 opacity-50">·</span>
                            last day: <span className="font-medium">{String(lastDay)}</span>
                          </>
                        ) : null}
                      </div>
                      {lastStats ? (
                        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                          last day stats: {num(lastStats.entries)} entries · {num(lastStats.media)} media · {num(lastStats.videos)} videos
                        </div>
                      ) : null}
                    </summary>

                    {r.error ? (
                      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                        {r.error}
                      </div>
                    ) : null}

                    {r.totals ? (
                      <pre className="mt-3 overflow-x-auto text-xs text-zinc-700 dark:text-zinc-300">
                        {JSON.stringify(r.totals, null, 2)}
                      </pre>
                    ) : null}
                  </details>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">No runs yet.</p>
          )}
        </details>
      </main>
    </div>
  );
}

