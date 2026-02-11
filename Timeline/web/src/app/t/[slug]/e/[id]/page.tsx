import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { hasPublicSupabaseEnv } from "../../../../../lib/env";
import { getTimelineBySlug } from "../../../../../lib/data/timelines";
import {
  getEntryById,
  listComments,
  listSources,
} from "../../../../../lib/data/entries";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

async function addComment(formData: FormData) {
  "use server";

  if (!hasPublicSupabaseEnv()) redirect("/");

  const slug = String(formData.get("slug") ?? "");
  const entryId = String(formData.get("entry_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!slug || !entryId) redirect("/");
  if (!body) redirect(`/t/${slug}/e/${entryId}?error=missing_comment`);

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { error } = await supabase.from("comments").insert({
    entry_id: entryId,
    body,
    created_by: user.id,
  });
  if (error) redirect(`/t/${slug}/e/${entryId}?error=${encodeURIComponent(error.message)}`);

  redirect(`/t/${slug}/e/${entryId}`);
}

async function reportEntry(formData: FormData) {
  "use server";

  if (!hasPublicSupabaseEnv()) redirect("/");

  const slug = String(formData.get("slug") ?? "");
  const entryId = String(formData.get("entry_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!slug || !entryId) redirect("/");
  if (!reason) redirect(`/t/${slug}/e/${entryId}?error=missing_report_reason`);

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    object_type: "entry",
    object_id: entryId,
    reason,
  });

  if (error) redirect(`/t/${slug}/e/${entryId}?error=${encodeURIComponent(error.message)}`);
  redirect(`/t/${slug}/e/${entryId}?reported=1`);
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

  const [sources, comments] = await Promise.all([
    listSources(entry.id),
    listComments(entry.id),
  ]);

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  const sp = (await searchParams) ?? {};
  const error = sp.error;
  const reported = sp.reported === "1";

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Link
            className="text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-300"
            href={`/t/${timeline.slug}`}
          >
            ← {timeline.title}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {entry.type}
            </span>
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              {new Date(entry.time_start).toISOString()}
            </span>
            {entry.status !== "active" && (
              <span className="text-xs text-amber-700 dark:text-amber-300">
                {entry.status}
              </span>
            )}
          </div>
          {entry.title ? (
            <h1 className="text-2xl font-semibold tracking-tight">{entry.title}</h1>
          ) : null}
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-800 dark:text-zinc-200">
            {entry.body}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold">Sources</h2>
          {sources.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {sources.map((s) => (
                <li key={s.id}>
                  <a
                    className="break-all text-zinc-900 underline hover:no-underline dark:text-zinc-100"
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
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              No sources attached.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold">Discussion</h2>
            {!user && (
              <Link
                className="text-sm font-medium text-zinc-700 underline hover:no-underline dark:text-zinc-300"
                href="/login"
              >
                Sign in to comment
              </Link>
            )}
          </div>

          {entry.is_locked && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              Discussion is locked for this entry.
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
              <span className="font-medium">{error}</span>
            </div>
          )}

          {reported && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
              Report submitted.
            </div>
          )}

          {user && !entry.is_locked && (
            <form action={addComment} className="mt-4 space-y-3">
              <input type="hidden" name="slug" value={timeline.slug} />
              <input type="hidden" name="entry_id" value={entry.id} />
              <textarea
                className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                name="body"
                rows={3}
                placeholder="Add a comment…"
                required
              />
              <button className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                Post comment
              </button>
            </form>
          )}

          <div className="mt-6 space-y-3">
            {comments.length ? (
              comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {new Date(c.created_at).toISOString()}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                    {c.body}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No comments yet.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold">Report</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Report harassment, doxxing, threats, or other policy violations.
          </p>
          {user ? (
            <form action={reportEntry} className="mt-4 space-y-3">
              <input type="hidden" name="slug" value={timeline.slug} />
              <input type="hidden" name="entry_id" value={entry.id} />
              <textarea
                className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                name="reason"
                rows={3}
                placeholder="Why are you reporting this entry?"
                required
              />
              <button className="inline-flex items-center justify-center rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                Submit report
              </button>
            </form>
          ) : (
            <Link
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              href="/login"
            >
              Sign in to report
            </Link>
          )}
        </section>
      </main>
    </div>
  );
}

