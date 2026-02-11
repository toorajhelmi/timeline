import Link from "next/link";
import { redirect } from "next/navigation";

import { hasPublicSupabaseEnv } from "../lib/env";
import { listPublicTimelines } from "../lib/data/timelines";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { buildDemo } from "../lib/demo/createDemoTimeline";

export const dynamic = "force-dynamic";

async function createDemoTimeline() {
  "use server";

  if (!hasPublicSupabaseEnv()) redirect("/?error=missing_supabase_env");

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const demo = buildDemo();

  const { data: timeline, error: tErr } = await supabase
    .from("timelines")
    .insert({
      slug: demo.slug,
      title: demo.title,
      description: demo.description,
      tags: demo.tags,
      visibility: "public",
      created_by: user.id,
    })
    .select("id,slug")
    .single();

  if (tErr) redirect(`/?error=${encodeURIComponent(tErr.message)}`);

  await supabase.from("timeline_members").insert({
    timeline_id: timeline.id,
    user_id: user.id,
    role: "curator",
  });

  const entryIds: string[] = [];
  for (let i = 0; i < demo.entries.length; i++) {
    const e = demo.entries[i]!;

    const correctsId =
      e.type === "correction" && typeof e.corrects_index === "number"
        ? entryIds[e.corrects_index] ?? null
        : null;

    const { data: entry, error: eErr } = await supabase
      .from("entries")
      .insert({
        timeline_id: timeline.id,
        type: e.type,
        title: e.title ?? null,
        body: e.body,
        time_start: e.time_start,
        time_end: e.time_end ?? null,
        corrects_entry_id: correctsId,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (eErr) redirect(`/?error=${encodeURIComponent(eErr.message)}`);
    entryIds.push(entry.id);

    const urls = e.source_urls ?? [];
    if (urls.length) {
      await supabase.from("sources").insert(
        urls.map((url) => ({
          entry_id: entry.id,
          url,
          source_type: "web",
          added_by: user.id,
        })),
      );
    }

    if (e.pin) {
      await supabase.from("timeline_key_moments").insert({
        timeline_id: timeline.id,
        entry_id: entry.id,
        pinned_by: user.id,
      });
    }
  }

  redirect(`/t/${timeline.slug}`);
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const configured = hasPublicSupabaseEnv();
  const q = sp.q ?? "";
  const timelines = configured ? await listPublicTimelines({ q }) : [];
  const supabase = configured ? await createSupabaseServerClient() : null;
  const { data: userData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = userData.user;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-14">
        <header className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Explore timelines
          </h1>
          <p className="max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
            Browse public timelines. Zoom in and out, add sourced entries, and
            publish corrections without rewriting history.
          </p>
        </header>

        {!configured && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-medium">Supabase is not configured yet.</p>
            <p className="mt-1">
              Create <code>web/.env.local</code> from <code>web/.env.example</code>{" "}
              to enable public reads.
            </p>
          </div>
        )}

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form className="flex w-full max-w-xl items-center gap-2">
              <input
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-zinc-600"
                name="q"
                placeholder="Search timelines…"
                defaultValue={q}
              />
              <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                Search
              </button>
            </form>
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              href="/new"
            >
              New timeline
            </Link>
          </div>

          {user && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold">Demo data</div>
                  <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    Create a sample timeline with events so you can explore zoom,
                    filters, key moments, and entry pages.
                  </div>
                </div>
                <form action={createDemoTimeline}>
                  <button className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                    Create demo timeline
                  </button>
                </form>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {timelines.map((t) => (
              <Link
                key={t.id}
                href={`/t/${t.slug}`}
                className="group rounded-2xl border border-zinc-200 bg-white p-6 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-base font-semibold group-hover:underline">
                    {t.title}
                  </h2>
                  <span className="shrink-0 rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                    public
                  </span>
                </div>
                {t.description && (
                  <p className="mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {t.description}
                  </p>
                )}
                {t.tags?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {t.tags.slice(0, 6).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
            ))}

            {configured && timelines.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                No timelines yet. Create the first one.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
