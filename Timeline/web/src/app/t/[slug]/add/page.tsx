import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import type { EntryType } from "../../../../lib/db/types";
import { hasPublicSupabaseEnv } from "../../../../lib/env";
import { getTimelineBySlug } from "../../../../lib/data/timelines";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function clampEntryType(t?: string): EntryType {
  if (
    t === "update" ||
    t === "evidence" ||
    t === "claim" ||
    t === "context" ||
    t === "correction"
  )
    return t;
  return "update";
}

async function createEntry(formData: FormData) {
  "use server";

  if (!hasPublicSupabaseEnv()) redirect("/");

  const timelineId = String(formData.get("timeline_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const type = clampEntryType(String(formData.get("type") ?? ""));
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const timeStartLocal = String(formData.get("time_start") ?? "");
  const timeEndLocal = String(formData.get("time_end") ?? "");
  const sourceUrl = String(formData.get("source_url") ?? "").trim();
  const correctsEntryId = String(formData.get("corrects_entry_id") ?? "").trim();

  if (!timelineId || !slug) redirect("/");
  if (!body) redirect(`/t/${slug}/add?error=missing_body`);

  if ((type === "claim" || type === "evidence") && !sourceUrl) {
    redirect(`/t/${slug}/add?error=source_required`);
  }
  if (type === "correction" && !correctsEntryId) {
    redirect(`/t/${slug}/add?error=correction_requires_target`);
  }

  const time_start = new Date(timeStartLocal).toISOString();
  const time_end = timeEndLocal ? new Date(timeEndLocal).toISOString() : null;

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: entry, error } = await supabase
    .from("entries")
    .insert({
      timeline_id: timelineId,
      type,
      title: title || null,
      body,
      time_start,
      time_end,
      corrects_entry_id: type === "correction" ? correctsEntryId : null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) redirect(`/t/${slug}/add?error=${encodeURIComponent(error.message)}`);

  if (sourceUrl) {
    await supabase.from("sources").insert({
      entry_id: entry.id,
      url: sourceUrl,
      source_type: "web",
      added_by: user.id,
    });
  }

  redirect(`/t/${slug}/e/${entry.id}`);
}

export const dynamic = "force-dynamic";

export default async function AddEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { slug } = await params;

  if (!hasPublicSupabaseEnv()) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <main className="mx-auto w-full max-w-xl">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            Configure Supabase env vars to add entries.
          </div>
        </main>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const timeline = await getTimelineBySlug(slug);
  if (!timeline) notFound();

  const sp = (await searchParams) ?? {};
  const error = sp.error;
  const now = new Date();
  const nowLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto w-full max-w-xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Add entry</h1>
          <Link
            className="text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-300"
            href={`/t/${timeline.slug}`}
          >
            Back
          </Link>
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Posting to <span className="font-medium">{timeline.title}</span>.
        </p>

        {error && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            Create failed: <span className="font-medium">{error}</span>
          </div>
        )}

        <form
          action={createEntry}
          className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <input type="hidden" name="timeline_id" value={timeline.id} />
          <input type="hidden" name="slug" value={timeline.slug} />

          <label className="text-sm font-medium" htmlFor="type">
            Type
          </label>
          <select
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="type"
            name="type"
            defaultValue="update"
          >
            <option value="update">Update</option>
            <option value="evidence">Evidence</option>
            <option value="claim">Claim</option>
            <option value="context">Context</option>
            <option value="correction">Correction</option>
          </select>

          <label className="mt-5 block text-sm font-medium" htmlFor="title">
            Title (optional)
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="title"
            name="title"
            placeholder="Short headline"
          />

          <label className="mt-5 block text-sm font-medium" htmlFor="body">
            Body
          </label>
          <textarea
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="body"
            name="body"
            placeholder="What happened? Add context and keep it clear."
            rows={6}
            required
          />

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium" htmlFor="time_start">
                Time start
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                id="time_start"
                name="time_start"
                type="datetime-local"
                defaultValue={nowLocal}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="time_end">
                Time end (optional)
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                id="time_end"
                name="time_end"
                type="datetime-local"
              />
            </div>
          </div>

          <label className="mt-5 block text-sm font-medium" htmlFor="source_url">
            Source URL (required for Claim/Evidence)
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="source_url"
            name="source_url"
            placeholder="https://…"
            type="url"
          />

          <label
            className="mt-5 block text-sm font-medium"
            htmlFor="corrects_entry_id"
          >
            Corrects entry id (required for Correction)
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="corrects_entry_id"
            name="corrects_entry_id"
            placeholder="UUID of the entry being corrected"
          />

          <button className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
            Publish entry
          </button>
        </form>
      </main>
    </div>
  );
}

