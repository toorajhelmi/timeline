import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/dashboard";

async function setCanonical(formData: FormData) {
  "use server";

  const duplicateSlug = String(formData.get("duplicate_slug") ?? "").trim();
  const canonicalSlug = String(formData.get("canonical_slug") ?? "").trim();

  if (!duplicateSlug) redirect("/dashboard/timelines?error=missing_duplicate_slug");

  const { supabase } = await requireAdmin();

  const { data: dup, error: dupErr } = await supabase
    .from("timelines")
    .select("id,slug")
    .eq("slug", duplicateSlug)
    .maybeSingle();
  if (dupErr || !dup) redirect("/dashboard/timelines?error=duplicate_not_found");

  if (!canonicalSlug) {
    const { error } = await supabase
      .from("timelines")
      .update({ canonical_timeline_id: null })
      .eq("id", dup.id);
    if (error) redirect(`/dashboard/timelines?error=${encodeURIComponent(error.message)}`);
    redirect("/dashboard/timelines");
  }

  const { data: canon, error: canonErr } = await supabase
    .from("timelines")
    .select("id,slug")
    .eq("slug", canonicalSlug)
    .maybeSingle();
  if (canonErr || !canon) redirect("/dashboard/timelines?error=canonical_not_found");

  const { error } = await supabase
    .from("timelines")
    .update({ canonical_timeline_id: canon.id })
    .eq("id", dup.id);
  if (error) redirect(`/dashboard/timelines?error=${encodeURIComponent(error.message)}`);

  redirect("/dashboard/timelines");
}

export const dynamic = "force-dynamic";

export default async function AdminTimelinesPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const { supabase } = await requireAdmin();

  const { data: timelines, error } = await supabase
    .from("timelines")
    .select("id,slug,title,updated_at,canonical_timeline_id")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <main className="mx-auto w-full max-w-5xl">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            Failed to load timelines: {error.message}
          </div>
        </main>
      </div>
    );
  }

  const sp = (await searchParams) ?? {};
  const pageError = sp.error;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Admin · Timelines</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Claim/merge duplicates by redirecting them to a canonical timeline.
          </p>
        </header>

        {pageError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {pageError}
          </div>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold">Set canonical</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Provide the duplicate timeline slug and the canonical slug. Leave canonical
            blank to clear.
          </p>
          <form action={setCanonical} className="mt-4 grid gap-3 sm:grid-cols-3">
            <input
              className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              name="duplicate_slug"
              placeholder="duplicate-slug"
              required
            />
            <input
              className="rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              name="canonical_slug"
              placeholder="canonical-slug (optional)"
            />
            <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
              Save
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-600 dark:text-zinc-400">
                <tr>
                  <th className="py-2 pr-4">Updated</th>
                  <th className="py-2 pr-4">Slug</th>
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Canonical?</th>
                </tr>
              </thead>
              <tbody>
                {(timelines ?? []).map((t) => (
                  <tr key={t.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-3 pr-4 text-xs text-zinc-600 dark:text-zinc-400">
                      {new Date(t.updated_at).toISOString()}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      <Link className="underline hover:no-underline" href={`/dashboard/timelines/${t.slug}`}>
                        {t.slug}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">{t.title}</td>
                    <td className="py-3 pr-4 text-xs">
                      {t.canonical_timeline_id ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                          duplicate
                        </span>
                      ) : (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                          canonical
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {(timelines ?? []).length === 0 && (
                  <tr>
                    <td className="py-6 text-sm text-zinc-600 dark:text-zinc-400" colSpan={4}>
                      No timelines.
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

