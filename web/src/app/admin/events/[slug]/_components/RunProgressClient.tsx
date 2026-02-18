"use client";

import { useEffect, useMemo, useState } from "react";

type RunRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  range_from: string;
  range_to: string;
  totals: any;
  error: string | null;
};

type EventRow = {
  slug: string;
  title: string;
  is_paused: boolean;
  next_day: string;
  last_success_day: string | null;
  batch_days: number;
  daily_total: number;
  daily_media: number;
  daily_video: number;
  updated_at: string;
};

type ApiShape =
  | { ok: true; event: EventRow; runs: RunRow[] }
  | { ok: false; error: string };

function fmtIso(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function num(x: any, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

export function RunProgressClient({ slug }: { slug: string }) {
  const [data, setData] = useState<ApiShape | null>(null);
  const [loading, setLoading] = useState(true);

  const runningRun = useMemo(() => {
    if (!data || !("ok" in data) || !data.ok) return null;
    return (data.runs ?? []).find((r) => r.status === "running") ?? null;
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    let t: any = null;

    async function tick() {
      try {
        const res = await fetch(`/api/admin/events/${encodeURIComponent(slug)}/runs`, {
          cache: "no-store",
        });
        const j = (await res.json()) as ApiShape;
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setData({ ok: false, error: String((e as Error)?.message ?? e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    // poll: fast while running, slow otherwise
    function scheduleNext() {
      const ms = runningRun ? 2000 : 8000;
      t = setTimeout(async () => {
        await tick();
        scheduleNext();
      }, ms);
    }

    tick().then(scheduleNext);
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
    };
  }, [slug, runningRun]);

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        Loading run status…
      </div>
    );
  }

  if (!data || !("ok" in data) || !data.ok) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
        Failed to load live progress: {data && "error" in data ? data.error : "unknown error"}
      </div>
    );
  }

  const evt = data.event;
  const latest = data.runs?.[0] ?? null;
  const isRunning = Boolean(runningRun);
  const runTotals = (runningRun?.totals ?? {}) as any;
  const latestTotals = (latest?.totals ?? {}) as any;

  const currentDay = isRunning ? runTotals?.current_day ?? null : evt.next_day;
  const lastUpdateAt = isRunning ? runTotals?.last_update_at ?? null : null;
  const dayProgress = isRunning ? runTotals?.day_progress ?? null : null;
  const candidates = isRunning ? runTotals?.candidates ?? null : null;
  const totals = isRunning ? runTotals : null;

  // Prefer event checkpoint when not running, so reset actions reflect immediately.
  const lastDay = isRunning ? runTotals?.last_day ?? null : evt.last_success_day ?? null;
  const lastDayStats = isRunning ? runTotals?.last_day_stats ?? null : null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Live progress</div>
          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Event state:{" "}
            {evt.is_paused ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">paused</span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                unpaused
              </span>
            )}
            <span className="mx-2 opacity-50">·</span>
            Next day: <span className="font-medium">{evt.next_day}</span>
          </div>
        </div>

        {runningRun ? (
          <div className="text-xs text-zinc-600 dark:text-zinc-400">
            Running since <span className="font-medium">{fmtIso(runningRun.started_at)}</span>
          </div>
        ) : latest ? (
          <div className="text-xs text-zinc-600 dark:text-zinc-400">
            Latest run: <span className="font-medium">{latest.status}</span>{" "}
            <span className="opacity-80">({latest.range_from} → {latest.range_to})</span>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs text-zinc-600 dark:text-zinc-400">Totals (this batch)</div>
          <div className="mt-1 text-sm">
            <span className="font-medium">{totals?.entries ?? 0}</span> entries
          </div>
          <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            {totals?.media ?? 0} media · {totals?.videos ?? 0} videos · {totals?.images ?? 0} images ·{" "}
            {totals?.days ?? 0} days
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs text-zinc-600 dark:text-zinc-400">Live status</div>
          <div className="mt-1 text-sm">
            {currentDay ? (
              <>
                Day <span className="font-medium">{String(currentDay)}</span>
              </>
            ) : (
              "—"
            )}
          </div>
          <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            {lastUpdateAt ? (
              <>
                updated {fmtIso(String(lastUpdateAt))}
              </>
            ) : null}
          </div>
          <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            {isRunning && dayProgress ? (
              <>
                today:{" "}
                <span className="font-medium">{num(dayProgress.entries)}</span> entries ·{" "}
                <span className="font-medium">{num(dayProgress.media)}</span> media ·{" "}
                <span className="font-medium">{num(dayProgress.videos)}</span> videos ·{" "}
                <span className="font-medium">{num(dayProgress.images)}</span> images
              </>
            ) : isRunning && lastDayStats ? (
              `${lastDayStats.entries ?? 0} entries · ${lastDayStats.media ?? 0} media · ${lastDayStats.videos ?? 0} videos`
            ) : (
              "—"
            )}
          </div>
          <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            {isRunning && candidates ? (
              <>
                candidates: {num(candidates.fetched)} fetched / {num(candidates.poolSize)} pool
                {candidates.enriched !== undefined ? <> · enriched {num(candidates.enriched)}</> : null}
                {candidates.media_candidates !== undefined ? (
                  <> · media {num(candidates.media_candidates)}</>
                ) : null}
                {candidates.video_candidates !== undefined ? (
                  <> · video {num(candidates.video_candidates)}</>
                ) : null}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs text-zinc-600 dark:text-zinc-400">Last completed day</div>
          <div className="mt-1 text-sm">{lastDay ? <span className="font-medium">{lastDay}</span> : "—"}</div>
          <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            {lastDayStats
              ? `${lastDayStats.entries ?? 0} entries · ${lastDayStats.media ?? 0} media · ${lastDayStats.videos ?? 0} videos`
              : "—"}
          </div>
        </div>
      </div>

      {runningRun ? (
        <div className="mt-4 text-xs text-zinc-600 dark:text-zinc-400">
          This panel auto-refreshes while a batch is running.
        </div>
      ) : null}

      {latest?.error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          {latest.error}
        </div>
      ) : null}
    </section>
  );
}

