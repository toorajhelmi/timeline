import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { slugify } from "@/lib/utils/slugify";
import { parseTags } from "@/lib/utils/tags";
import crypto from "node:crypto";

async function createTimeline(formData: FormData) {
  "use server";

  if (!hasPublicSupabaseEnv()) {
    redirect("/?error=missing_supabase_env");
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const tagsInput = String(formData.get("tags") ?? "").trim();
  // v0: all timelines are created private. Creators can later request to go public.
  const visibility = "private";
  const themePrimary = String(formData.get("theme_primary") ?? "").trim() || "#ffffff";
  const themeSecondary = String(formData.get("theme_secondary") ?? "").trim() || "#64748b";
  const themeText = String(formData.get("theme_text") ?? "").trim() || "#0f172a";

  if (!title) redirect("/new?error=missing_title");

  const baseSlug = slugify(title);
  if (!baseSlug) redirect("/new?error=invalid_title");

  const tags = parseTags(tagsInput);

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect(`/auth/login?next=${encodeURIComponent("/new")}`);

  // Auto-generate slug. If there's a collision, append a short suffix.
  let timeline: { id: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slug =
      attempt === 0
        ? baseSlug
        : `${baseSlug}-${crypto.randomBytes(3).toString("hex")}`;

    const { data, error } = await supabase
      .from("timelines")
      .insert({
        slug,
        title,
        description,
        tags,
        visibility,
        created_by: user.id,
        theme_primary: themePrimary,
        theme_secondary: themeSecondary,
        theme_text: themeText,
      })
      .select("id,slug")
      .single();

    if (!error && data) {
      timeline = data;
      break;
    }

    // If it's not a slug collision, fail immediately.
    const msg = String(error?.message ?? "");
    if (attempt >= 3 || !msg.toLowerCase().includes("duplicate")) {
      redirect(`/new?error=${encodeURIComponent(msg || "create_failed")}`);
    }
  }

  if (!timeline) redirect(`/new?error=${encodeURIComponent("create_failed")}`);

  // Make creator a curator.
  await supabase.from("timeline_members").insert({
    timeline_id: timeline.id,
    user_id: user.id,
    role: "curator",
  });

  redirect(`/timelines/${timeline.slug}`);
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
    <div className="dark min-h-screen bg-zinc-950 px-6 py-14 text-zinc-50">
      <main className="mx-auto w-full max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">New timeline</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Timelines start private. You can add entries immediately, then request to publish it when
          it’s ready—an admin must approve before it appears publicly.
        </p>

        {error && (
          <div className="mt-6 rounded-xl border border-rose-900/40 bg-rose-950/30 p-4 text-sm text-rose-200">
            Create failed: <span className="font-medium">{error}</span>
          </div>
        )}

        <form
          action={createTimeline}
          className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
        >
          <label className="text-sm font-medium" htmlFor="title">
            Title
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="title"
            name="title"
            required
          />

          <label className="mt-5 block text-sm font-medium" htmlFor="description">
            Description
          </label>
          <textarea
            className="mt-2 w-full resize-none rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="description"
            name="description"
            rows={4}
          />

          <label className="mt-5 block text-sm font-medium" htmlFor="tags">
            Tags (comma-separated)
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="tags"
            name="tags"
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <label className="grid gap-2 text-sm font-medium" htmlFor="theme_primary">
              Primary
              <input
                id="theme_primary"
                name="theme_primary"
                type="color"
                defaultValue="#ffffff"
                className="h-10 w-full rounded-xl border border-zinc-300 bg-transparent p-1 dark:border-zinc-700"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium" htmlFor="theme_secondary">
              Secondary
              <input
                id="theme_secondary"
                name="theme_secondary"
                type="color"
                defaultValue="#64748b"
                className="h-10 w-full rounded-xl border border-zinc-300 bg-transparent p-1 dark:border-zinc-700"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium" htmlFor="theme_text">
              Text
              <input
                id="theme_text"
                name="theme_text"
                type="color"
                defaultValue="#0f172a"
                className="h-10 w-full rounded-xl border border-zinc-300 bg-transparent p-1 dark:border-zinc-700"
              />
            </label>
          </div>

          <button className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
            Create timeline
          </button>
        </form>
      </main>
    </div>
  );
}

