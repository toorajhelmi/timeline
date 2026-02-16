import Link from "next/link";

import { requireAdmin } from "../../../lib/auth/admin";

export const dynamic = "force-dynamic";

type IngestEventRow = {
  id: string;
  slug: string;
  title: string;
  start_day: string;
  next_day: string;
  last_success_day: string | null;
  daily_total: number;
  daily_media: number;
  daily_video: number;
  batch_days: number;
  is_paused: boolean;
  updated_at: string;
};

export default async function AdminEventsPage() {
  let supabase;
  try {
    ({ supabase } = await requireAdmin({ nextPath: "/admin/events" }));
  } catch (e) {
    // Don't swallow redirects (login/admin-only).
    if (String((e as any)?.digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <main className="mx-auto w-full max-w-5xl">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            Admin requires <code>SUPABASE_SERVICE_ROLE_KEY</code> on the server.
            <div className="mt-2 text-xs opacity-90">
              {String((e as Error)?.message ?? e)}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const { data: events, error } = await supabase
    .from("ingest_events")
    .select(
      "id,slug,title,start_day,next_day,last_success_day,daily_total,daily_media,daily_video,batch_days,is_paused,updated_at",
    )
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <main className="mx-auto w-full max-w-5xl">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            Failed to load ingest events: {error.message}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ingestion</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Configure events, track progress, and resume from checkpoints.
            </p>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            href="/admin/events/new"
          >
            New event
          </Link>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          {events?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-zinc-600 dark:text-zinc-400">
                  <tr>
                    <th className="p-2">Event</th>
                    <th className="p-2">Start</th>
                    <th className="p-2">Next</th>
                    <th className="p-2">Last ok</th>
                    <th className="p-2">Targets/day</th>
                    <th className="p-2">Batch</th>
                    <th className="p-2">State</th>
                  </tr>
                </thead>
                <tbody>
                  {(events ?? []).map((e: IngestEventRow) => (
                    <tr
                      key={e.id}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="p-2">
                        <div className="font-medium">{e.title}</div>
                        <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                          <Link
                            href={`/admin/events/${e.slug}`}
                            className="underline hover:no-underline"
                          >
                            {e.slug}
                          </Link>
                          <span className="mx-2 opacity-50">·</span>
                          <Link href={`/t/${e.slug}`} className="underline hover:no-underline">
                            /t/{e.slug}
                          </Link>
                        </div>
                      </td>
                      <td className="p-2 text-xs">{e.start_day}</td>
                      <td className="p-2 text-xs">{e.next_day}</td>
                      <td className="p-2 text-xs">{e.last_success_day ?? "—"}</td>
                      <td className="p-2 text-xs">
                        {e.daily_total} total / {e.daily_media} media / {e.daily_video} video
                      </td>
                      <td className="p-2 text-xs">{e.batch_days} days</td>
                      <td className="p-2 text-xs">
                        {e.is_paused ? (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                            paused
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                            active
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 text-sm text-zinc-600 dark:text-zinc-400">
              No ingest events yet.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

