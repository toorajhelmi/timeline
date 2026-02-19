import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { getTimelineBySlug } from "@/lib/data/timelines";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AddEntryFormClient from "@/components/entries/add/AddEntryFormClient";

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
  // Run auth + timeline lookup in parallel to reduce navigation latency.
  const [{ data: userData }, timeline] = await Promise.all([
    supabase.auth.getUser(),
    getTimelineBySlug(slug),
  ]);
  if (!userData.user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/timelines/${slug}/add`)}`);
  }
  if (!timeline) notFound();

  const sp = (await searchParams) ?? {};
  const error = sp.error;

  return (
    <div className="dark min-h-screen bg-zinc-950 px-6 py-14 text-zinc-50">
      <main className="mx-auto w-full max-w-xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Add entry</h1>
          <Link
            className="text-sm font-medium text-zinc-300 hover:underline"
            href={`/timelines/${timeline.slug}`}
          >
            Back
          </Link>
        </div>
        <p className="mt-2 text-sm text-zinc-300">
          Posting to <span className="font-medium">{timeline.title}</span>.
        </p>

        {error && (
          <div className="mt-6 rounded-xl border border-rose-900/40 bg-rose-950/30 p-4 text-sm text-rose-200">
            Create failed: <span className="font-medium">{error}</span>
          </div>
        )}

        <AddEntryFormClient timelineId={timeline.id} timelineSlug={timeline.slug} />
      </main>
    </div>
  );
}

