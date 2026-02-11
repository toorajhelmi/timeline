import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../../lib/supabase/server";
import { hasPublicSupabaseEnv } from "../../lib/env";
import { slugify } from "../../lib/utils/slugify";
import { parseTags } from "../../lib/utils/tags";

async function createTimeline(formData: FormData) {
  "use server";

  if (!hasPublicSupabaseEnv()) {
    redirect("/?error=missing_supabase_env");
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const tagsInput = String(formData.get("tags") ?? "").trim();

  if (!title) redirect("/new?error=missing_title");

  const slug = slugInput ? slugify(slugInput) : slugify(title);
  if (!slug) redirect("/new?error=invalid_slug");

  const tags = parseTags(tagsInput);

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: timeline, error } = await supabase
    .from("timelines")
    .insert({
      slug,
      title,
      description,
      tags,
      visibility: "public",
      created_by: user.id,
    })
    .select("id,slug")
    .single();

  if (error) {
    redirect(`/new?error=${encodeURIComponent(error.message)}`);
  }

  // Make creator a curator.
  await supabase.from("timeline_members").insert({
    timeline_id: timeline.id,
    user_id: user.id,
    role: "curator",
  });

  redirect(`/t/${timeline.slug}`);
}

export const dynamic = "force-dynamic";

export default async function NewTimelinePage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const error = sp.error;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto w-full max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">New timeline</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Create a public timeline for a long-running topic. You can start adding
          entries immediately.
        </p>

        {error && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            Create failed: <span className="font-medium">{error}</span>
          </div>
        )}

        <form
          action={createTimeline}
          className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <label className="text-sm font-medium" htmlFor="title">
            Title
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="title"
            name="title"
            placeholder="Woman, Life, Freedom"
            required
          />

          <label className="mt-5 block text-sm font-medium" htmlFor="slug">
            Slug (optional)
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="slug"
            name="slug"
            placeholder="woman-life-freedom"
          />

          <label className="mt-5 block text-sm font-medium" htmlFor="description">
            Description
          </label>
          <textarea
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="description"
            name="description"
            placeholder="A community timeline collecting key moments, sources, and corrections."
            rows={4}
          />

          <label className="mt-5 block text-sm font-medium" htmlFor="tags">
            Tags (comma-separated)
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="tags"
            name="tags"
            placeholder="iran, protests, human-rights"
          />

          <button className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
            Create timeline
          </button>
        </form>
      </main>
    </div>
  );
}

