import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireAdmin } from "../../../../lib/auth/admin";

async function pinEntry(formData: FormData) {
  "use server";
  const timelineId = String(formData.get("timeline_id") ?? "");
  const entryId = String(formData.get("entry_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!timelineId || !entryId || !slug) redirect("/admin/timelines");

  const { supabase, user } = await requireAdmin();
  await supabase.from("timeline_key_moments").insert({
    timeline_id: timelineId,
    entry_id: entryId,
    pinned_by: user.id,
  });
  redirect(`/admin/timelines/${slug}`);
}

async function unpinEntry(formData: FormData) {
  "use server";
  const timelineId = String(formData.get("timeline_id") ?? "");
  const entryId = String(formData.get("entry_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!timelineId || !entryId || !slug) redirect("/admin/timelines");

  const { supabase } = await requireAdmin();
  await supabase
    .from("timeline_key_moments")
    .delete()
    .eq("timeline_id", timelineId)
    .eq("entry_id", entryId);
  redirect(`/admin/timelines/${slug}`);
}

async function setEntryLock(formData: FormData) {
  "use server";
  const slug = String(formData.get("slug") ?? "");
  const entryId = String(formData.get("entry_id") ?? "");
  const isLocked = String(formData.get("is_locked") ?? "") === "true";
  if (!slug || !entryId) redirect("/admin/timelines");

  const { supabase } = await requireAdmin();
  await supabase.from("entries").update({ is_locked: isLocked }).eq("id", entryId);
  redirect(`/admin/timelines/${slug}`);
}

async function setEntryStatus(formData: FormData) {
  "use server";
  const slug = String(formData.get("slug") ?? "");
  const entryId = String(formData.get("entry_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!slug || !entryId || !status) redirect("/admin/timelines");

  const { supabase } = await requireAdmin();
  await supabase.from("entries").update({ status }).eq("id", entryId);
  redirect(`/admin/timelines/${slug}`);
}

export const dynamic = "force-dynamic";

export default async function AdminTimelineDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { supabase } = await requireAdmin();

  const { data: timeline, error: timelineError } = await supabase
    .from("timelines")
    .select("id,slug,title")
    .eq("slug", slug)
    .maybeSingle();

  if (timelineError) {
    redirect(`/admin/timelines?error=${encodeURIComponent(timelineError.message)}`);
  }
  if (!timeline) notFound();

  const [{ data: entries }, { data: keyMoments }] = await Promise.all([
    supabase
      .from("entries")
      .select("id,type,title,body,time_start,status,is_locked")
      .eq("timeline_id", timeline.id)
      .order("time_start", { ascending: false })
      .limit(200),
    supabase
      .from("timeline_key_moments")
      .select("entry_id")
      .eq("timeline_id", timeline.id),
  ]);

  const pinnedSet = new Set((keyMoments ?? []).map((k) => k.entry_id));

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">
              Admin · {timeline.title}
            </h1>
            <Link
              className="text-sm font-medium text-zinc-700 underline hover:no-underline dark:text-zinc-300"
              href="/admin/timelines"
            >
              Back
            </Link>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Pin key moments, lock discussions, and hide/remove entries.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-600 dark:text-zinc-400">
                <tr>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Content</th>
                  <th className="py-2 pr-4">Pinned</th>
                  <th className="py-2 pr-4">Locked</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {(entries ?? []).map((e) => {
                  const pinned = pinnedSet.has(e.id);
                  return (
                    <tr
                      key={e.id}
                      className="border-t border-zinc-100 align-top dark:border-zinc-800"
                    >
                      <td className="py-3 pr-4 text-xs text-zinc-600 dark:text-zinc-400">
                        {new Date(e.time_start).toISOString()}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {e.type}
                        </span>
                      </td>
                      <td className="py-3 pr-4 max-w-[520px]">
                        <div className="text-sm font-medium">{e.title ?? "—"}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {e.body}
                        </div>
                        <div className="mt-2 text-xs font-mono text-zinc-500 dark:text-zinc-500">
                          {e.id}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {pinned ? (
                          <form action={unpinEntry}>
                            <input type="hidden" name="timeline_id" value={timeline.id} />
                            <input type="hidden" name="entry_id" value={e.id} />
                            <input type="hidden" name="slug" value={timeline.slug} />
                            <button className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                              Unpin
                            </button>
                          </form>
                        ) : (
                          <form action={pinEntry}>
                            <input type="hidden" name="timeline_id" value={timeline.id} />
                            <input type="hidden" name="entry_id" value={e.id} />
                            <input type="hidden" name="slug" value={timeline.slug} />
                            <button className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                              Pin
                            </button>
                          </form>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <form action={setEntryLock} className="flex items-center gap-2">
                          <input type="hidden" name="slug" value={timeline.slug} />
                          <input type="hidden" name="entry_id" value={e.id} />
                          <input
                            type="hidden"
                            name="is_locked"
                            value={String(!e.is_locked)}
                          />
                          <button className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                            {e.is_locked ? "Unlock" : "Lock"}
                          </button>
                        </form>
                      </td>
                      <td className="py-3 pr-4">
                        <form action={setEntryStatus} className="flex items-center gap-2">
                          <input type="hidden" name="slug" value={timeline.slug} />
                          <input type="hidden" name="entry_id" value={e.id} />
                          <select
                            className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
                            name="status"
                            defaultValue={e.status}
                          >
                            <option value="active">active</option>
                            <option value="disputed">disputed</option>
                            <option value="hidden">hidden</option>
                            <option value="removed">removed</option>
                          </select>
                          <button className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                            Save
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
                {(entries ?? []).length === 0 && (
                  <tr>
                    <td className="py-6 text-sm text-zinc-600 dark:text-zinc-400" colSpan={6}>
                      No entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

