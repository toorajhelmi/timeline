import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getTimelineBySlug } from "../../../../lib/data/timelines";

async function updateTheme(formData: FormData) {
  "use server";

  const slug = String(formData.get("slug") ?? "").trim();
  const theme_primary = String(formData.get("theme_primary") ?? "").trim();
  const theme_secondary = String(formData.get("theme_secondary") ?? "").trim();
  const theme_text = String(formData.get("theme_text") ?? "").trim();

  if (!slug) redirect("/?error=missing_slug");

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect(`/login?next=${encodeURIComponent(`/t/${slug}/settings`)}`);

  const timeline = await getTimelineBySlug(slug);
  if (!timeline) redirect("/");

  const { error } = await supabase
    .from("timelines")
    .update({
      theme_primary,
      theme_secondary,
      theme_text,
    })
    .eq("id", timeline.id);

  if (error) {
    redirect(`/t/${slug}/settings?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/t/${slug}/settings?saved=1`);
}

async function setVisibility(formData: FormData) {
  "use server";

  const slug = String(formData.get("slug") ?? "").trim();
  const intent = String(formData.get("intent") ?? "").trim();

  if (!slug) redirect("/?error=missing_slug");

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect(`/login?next=${encodeURIComponent(`/t/${slug}/settings`)}`);

  const timeline = await getTimelineBySlug(slug);
  if (!timeline) redirect("/");

  // visibility semantics:
  // - private: only members/creator can view
  // - limited: creator requested public listing (pending admin approval)
  // - public: approved and listed
  const desired =
    intent === "make_private" ? "private" : intent === "request_public" ? "limited" : null;
  if (!desired) redirect(`/t/${slug}/settings?error=${encodeURIComponent("invalid_visibility_intent")}`);

  // If already public and requesting public again, keep public.
  const nextVisibility =
    desired === "limited" && timeline.visibility === "public" ? "public" : desired;

  const { error } = await supabase
    .from("timelines")
    .update({
      visibility: nextVisibility,
    })
    .eq("id", timeline.id);

  if (error) {
    redirect(`/t/${slug}/settings?error=${encodeURIComponent(error.message)}`);
  }

  if (nextVisibility === "limited") {
    redirect(`/t/${slug}/settings?requested_public=1`);
  }

  redirect(`/t/${slug}/settings?saved=1`);
}

export const dynamic = "force-dynamic";

export default async function TimelineSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ error?: string; saved?: string; requested_public?: string }>;
}) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const error = sp.error;
  const saved = sp.saved === "1";
  const requestedPublic = sp.requested_public === "1";

  const timeline = await getTimelineBySlug(slug);
  if (!timeline) redirect("/");
  const isPrivate = timeline.visibility === "private";
  const isPending = timeline.visibility === "limited";
  const isPublic = timeline.visibility === "public";

  return (
    <div className="dark min-h-screen bg-zinc-950 px-6 py-14 text-zinc-50">
      <main className="mx-auto w-full max-w-xl">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Timeline settings</h1>
          <Link
            className="text-sm font-medium text-zinc-300 underline hover:no-underline"
            href={`/t/${timeline.slug}`}
          >
            Back
          </Link>
        </header>
        <p className="mt-2 text-sm text-zinc-300">
          Request to publish your timeline once it’s ready. Public timelines require admin approval
          before they appear on the homepage.
        </p>

        {error ? (
          <div className="mt-6 rounded-xl border border-rose-900/40 bg-rose-950/30 p-4 text-sm text-rose-200">
            Update failed: <span className="font-medium">{error}</span>
          </div>
        ) : null}
        {saved ? (
          <div className="mt-6 rounded-xl border border-emerald-900/40 bg-emerald-950/30 p-4 text-sm text-emerald-200">
            Saved.
          </div>
        ) : null}
        {requestedPublic || timeline.visibility === "limited" ? (
          <div className="mt-6 rounded-xl border border-amber-900/40 bg-amber-950/30 p-4 text-sm text-amber-200">
            Public listing requested. This timeline will appear publicly only after an admin approves
            it.
          </div>
        ) : null}

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-sm font-semibold">Visibility</h2>
          <p className="mt-1 text-sm text-zinc-300">
            New timelines start private. If you request public listing, an admin must approve it
            before it appears on the homepage.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {!isPrivate ? (
              <form action={setVisibility}>
                <input type="hidden" name="slug" value={timeline.slug} />
                <input type="hidden" name="intent" value="make_private" />
                <button
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
                  type="submit"
                >
                  {isPending ? "Cancel request" : "Make private"}
                </button>
              </form>
            ) : null}

            {!isPublic && !isPending ? (
              <form action={setVisibility}>
                <input type="hidden" name="slug" value={timeline.slug} />
                <input type="hidden" name="intent" value="request_public" />
                <button
                  className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
                  type="submit"
                >
                  Request public listing
                </button>
              </form>
            ) : null}

            {isPending ? (
              <span className="inline-flex items-center justify-center rounded-xl border border-amber-900/40 bg-amber-950/30 px-4 py-2 text-sm font-medium text-amber-200">
                Requested
              </span>
            ) : null}
          </div>

          <div className="mt-3 text-xs text-zinc-400">
            Current state:{" "}
            <span className="font-medium text-zinc-100">
              {timeline.visibility === "public"
                ? "Public (approved)"
                : timeline.visibility === "limited"
                  ? "Pending admin approval"
                  : "Private"}
            </span>
          </div>
        </section>

        <form
          action={updateTheme}
          className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
        >
          <input type="hidden" name="slug" value={timeline.slug} />

          <h2 className="text-sm font-semibold">Theme</h2>
          <p className="mt-1 text-sm text-zinc-300">
            Primary is used for card backgrounds. Secondary is used for rails/lines. Text is used
            for themed labels.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="grid gap-2 text-sm font-medium" htmlFor="theme_primary">
              Primary
              <input
                id="theme_primary"
                name="theme_primary"
                type="color"
                defaultValue={timeline.theme_primary || "#ffffff"}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-transparent p-1 dark:border-zinc-700"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium" htmlFor="theme_secondary">
              Secondary
              <input
                id="theme_secondary"
                name="theme_secondary"
                type="color"
                defaultValue={timeline.theme_secondary || "#64748b"}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-transparent p-1 dark:border-zinc-700"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium" htmlFor="theme_text">
              Text
              <input
                id="theme_text"
                name="theme_text"
                type="color"
                defaultValue={timeline.theme_text || "#0f172a"}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-transparent p-1 dark:border-zinc-700"
              />
            </label>
          </div>

          <button className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
            Save theme
          </button>
        </form>
      </main>
    </div>
  );
}

