import Link from "next/link";
import { redirect } from "next/navigation";

import { hasPublicSupabaseEnv } from "../lib/env";
import { listPublicTimelines } from "../lib/data/timelines";
import { createSupabaseServerClient } from "../lib/supabase/server";

export const dynamic = "force-dynamic";

function hash32(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  const s = String(input ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function strokeSvgDataUrl(seed: string, secondary: string, accent: string): string {
  const variants = [
    "M30 60 C 120 20, 200 30, 290 80 S 420 140, 450 110",
    "M40 140 C 110 90, 180 170, 260 120 S 390 40, 440 80",
    "M20 105 C 140 160, 260 40, 360 120 S 460 160, 480 100",
    "M60 40 C 130 120, 210 0, 300 70 S 420 180, 470 140",
    "M10 150 C 90 60, 210 200, 310 110 S 430 50, 470 95",
  ] as const;
  const pick = variants[hash32(seed) % variants.length] ?? variants[0];
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 220" preserveAspectRatio="none">
  <path d="${pick}" fill="none" stroke="${secondary}" stroke-opacity="0.35" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M0 185 C 120 140, 260 220, 480 160" fill="none" stroke="${secondary}" stroke-opacity="0.18" stroke-width="2" stroke-linecap="round"/>
  <path d="M0 30 C 130 70, 250 10, 480 55" fill="none" stroke="${accent}" stroke-opacity="0.12" stroke-width="2" stroke-linecap="round"/>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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
            Follow the story as it unfolds. Add evidence and calls to action—then
            zoom from days to years to see how events connect.
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
              href={user ? `/new` : `/login?next=${encodeURIComponent("/new")}`}
            >
              New timeline
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {timelines.map((t) => (
              <Link
                key={t.id}
                href={`/t/${t.slug}`}
                className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                {(() => {
                  const primary = String((t as any).theme_primary ?? "").trim() || "#ffffff";
                  const secondary = String((t as any).theme_secondary ?? "").trim() || "#64748b";
                  const accent = String((t as any).theme_text ?? "").trim() || "#0f172a";
                  const stroke = strokeSvgDataUrl(`${t.slug}:${t.id}`, secondary, accent);
                  const overlay = {
                    backgroundImage: [
                      `url("${stroke}")`,
                      `radial-gradient(520px 220px at 15% 20%, color-mix(in oklab, ${secondary} 24%, transparent) 0%, transparent 62%)`,
                      `radial-gradient(520px 220px at 95% 0%, color-mix(in oklab, ${secondary} 18%, transparent) 0%, transparent 62%)`,
                      `linear-gradient(135deg, color-mix(in oklab, ${primary} 82%, white) 0%, color-mix(in oklab, ${primary} 55%, ${secondary}) 55%, color-mix(in oklab, ${primary} 82%, white) 100%)`,
                    ].join(", "),
                  } as React.CSSProperties;

                  return (
                    <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.55]">
                      <div className="absolute inset-0" style={overlay} />
                      <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/10 dark:from-white/5 dark:to-black/20" />
                    </div>
                  );
                })()}

                <div className="relative">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-base font-semibold group-hover:underline">
                      {t.title}
                    </h2>
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
                </div>
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
