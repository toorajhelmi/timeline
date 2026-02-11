import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import type { EntryType } from "../../../../lib/db/types";
import { hasPublicSupabaseEnv } from "../../../../lib/env";
import {
  listEntries,
  listKeyMoments,
  listSourcesForEntries,
} from "../../../../lib/data/entries";
import {
  bucketLabel,
  clampZoom,
  parseRange,
  toIso,
  type Zoom,
} from "../../../../lib/utils/time";
import {
  getTimelineById,
  getTimelineBySlug,
} from "../../../../lib/data/timelines";
import TimelineEntryCard from "./TimelineEntryCard";
import type { Entry, Source } from "../../../../lib/db/types";
import FiltersDrawer from "./FiltersDrawer";

export type TimelineLayoutVariant = "A" | "B";

function clampEntryType(t?: string): EntryType | undefined {
  if (
    t === "update" ||
    t === "evidence" ||
    t === "claim" ||
    t === "context" ||
    t === "correction"
  )
    return t;
  return undefined;
}

function zoomLabel(zoom: Zoom): string {
  if (zoom === "year") return "Year";
  if (zoom === "month") return "Month";
  if (zoom === "week") return "Week";
  return "Day";
}

function viewSwitcher(slug: string, active: TimelineLayoutVariant) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500 dark:text-zinc-500">View</span>
      <Link
        className={`rounded-full border px-2 py-1 ${
          active === "A"
            ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
            : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        }`}
        href={`/t/${slug}/a`}
      >
        A
      </Link>
      <Link
        className={`rounded-full border px-2 py-1 ${
          active === "B"
            ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
            : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        }`}
        href={`/t/${slug}/b`}
      >
        B
      </Link>
    </div>
  );
}

function AboutPanel({ title, description }: { title: string; description: string }) {
  return (
    <details className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer list-none text-sm font-semibold">
        About
      </summary>
      <div className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
        <div className="font-semibold">{title}</div>
        <div className="mt-2 leading-6">{description || "No description."}</div>
      </div>
    </details>
  );
}

function KeyMomentsStrip({
  slug,
  keyMoments,
}: {
  slug: string;
  keyMoments: Entry[];
}) {
  if (!keyMoments.length) return null;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Highlights</h2>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">pinned</span>
      </div>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {keyMoments.slice(0, 10).map((e) => (
          <Link
            key={e.id}
            href={`/t/${slug}/e/${e.id}`}
            className="min-w-[280px] rounded-2xl border border-zinc-200 bg-zinc-50 p-4 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {e.type}
              </span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {new Date(e.time_start).toISOString()}
              </span>
            </div>
            {e.title ? (
              <div className="mt-2 text-sm font-semibold">{e.title}</div>
            ) : null}
            <div className="mt-1 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300">
              {e.body}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function FiltersPanel({
  slug,
  zoom,
  entryType,
  rangeLabel,
}: {
  slug: string;
  zoom: Zoom;
  entryType?: EntryType;
  rangeLabel: string;
}) {
  return (
    <details className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer list-none text-sm font-semibold">
        Filters
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Zoom</span>
          {(["year", "month", "week", "day"] as Zoom[]).map((z) => (
            <Link
              key={z}
              className={`rounded-full border px-3 py-1 ${
                z === zoom
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                  : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              }`}
              href={`/t/${slug}?z=${z}`}
            >
              {zoomLabel(z)}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Type</span>
          <Link
            className={`rounded-full border px-3 py-1 ${
              !entryType
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
            href={`/t/${slug}?z=${zoom}`}
          >
            All
          </Link>
          {(
            ["update", "evidence", "claim", "context", "correction"] as EntryType[]
          ).map((t) => (
            <Link
              key={t}
              className={`rounded-full border px-3 py-1 ${
                entryType === t
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                  : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              }`}
              href={`/t/${slug}?z=${zoom}&type=${t}`}
            >
              {t}
            </Link>
          ))}
        </div>

        <div className="text-xs text-zinc-600 dark:text-zinc-400">{rangeLabel}</div>
      </div>
    </details>
  );
}

function TimelineRail({
  timelineSlug,
  zoom,
  groups,
  groupKeys,
  sourcesByEntryId,
}: {
  timelineSlug: string;
  zoom: Zoom;
  groups: Map<string, Entry[]>;
  groupKeys: string[];
  sourcesByEntryId: Map<string, Source[]>;
}) {
  return (
    <section className="flex flex-col gap-6">
      {groupKeys.map((k) => {
        const group = groups.get(k)!;
        const dense = group.length > 6;
        const shown = dense ? group.slice(0, 6) : group;
        return (
          <div key={k} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {k}
              </h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                {group.length} items
              </span>
            </div>
            <div className="relative mt-2 pl-8">
              <div className="pointer-events-none absolute bottom-0 left-[9px] top-0 w-px bg-zinc-200 dark:bg-zinc-800" />
              <div className="pointer-events-none absolute left-[2px] top-[18px] h-[16px] w-[16px] rounded-full border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900" />
              <div className="pointer-events-none absolute left-[9px] right-0 top-[26px] h-px bg-zinc-200 dark:bg-zinc-800" />

              <div
                className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]"
                data-timeline-scroll
              >
                {shown.map((e) => (
                  <TimelineEntryCard
                    key={e.id}
                    timelineSlug={timelineSlug}
                    entry={e}
                    sources={sourcesByEntryId.get(e.id) ?? []}
                    zoom={zoom}
                  />
                ))}
                {dense && (
                  <div className="relative min-w-[220px] pt-8">
                    <div className="pointer-events-none absolute left-[-18px] top-[22px] h-[10px] w-[10px] rounded-full bg-zinc-900/40 dark:bg-white/40" />
                    <div className="pointer-events-none absolute left-[-14px] top-[26px] h-5 w-px bg-zinc-200 dark:bg-zinc-800" />
                    <Link
                      href={`/t/${timelineSlug}?z=${zoom}`}
                      className="block rounded-2xl border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      +{group.length - shown.length} more in this bucket
                      <div className="mt-1 text-xs text-zinc-500">
                        Scroll or zoom in for detail
                      </div>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default async function TimelineCompareView({
  slug,
  variant,
  searchParams,
}: {
  slug: string;
  variant: TimelineLayoutVariant;
  searchParams?: Promise<{ z?: string; from?: string; to?: string; type?: string }>;
}) {
  if (!hasPublicSupabaseEnv()) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <main className="mx-auto w-full max-w-5xl">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            Configure Supabase env vars to load timelines.
          </div>
        </main>
      </div>
    );
  }

  const timeline = await getTimelineBySlug(slug);
  if (!timeline) notFound();

  if (timeline.canonical_timeline_id) {
    const canonical = await getTimelineById(timeline.canonical_timeline_id);
    if (canonical?.slug) redirect(`/t/${canonical.slug}`);
  }

  const sp = (await searchParams) ?? {};
  const zoom = clampZoom(sp.z);
  const range = parseRange({ zoom, from: sp.from, to: sp.to });
  const entryType = clampEntryType(sp.type);

  const [keyMoments, entries] = await Promise.all([
    listKeyMoments(timeline.id),
    listEntries({
      timelineId: timeline.id,
      fromIso: toIso(range.from),
      toIso: toIso(range.to),
      type: entryType,
      limit: 500,
    }),
  ]);

  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = bucketLabel(zoom, e.time_start);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  const groupKeys = Array.from(groups.keys()).sort().reverse();
  const sourcesByEntryId = await listSourcesForEntries(entries.map((e) => e.id));

  const rangeLabel = `Showing up to 500 entries from ${range.from.toISOString()} to ${range.to.toISOString()}.`;

  // Layout A: compact sticky header + in-timeline highlights, filters via details.
  if (variant === "A") {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mx-auto flex w-full max-w-5xl items-start justify-between gap-4 px-6 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                  {timeline.title}
                </h1>
                {viewSwitcher(timeline.slug, "A")}
              </div>
              {timeline.description ? (
                <p className="mt-1 line-clamp-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {timeline.description}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                href={`/t/${timeline.slug}/add`}
              >
                Add entry
              </Link>
            </div>
          </div>
        </div>

        <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-6">
          <KeyMomentsStrip slug={timeline.slug} keyMoments={keyMoments} />
          <TimelineRail
            timelineSlug={timeline.slug}
            zoom={zoom}
            groups={groups}
            groupKeys={groupKeys}
            sourcesByEntryId={sourcesByEntryId}
          />
        </main>

        <FiltersDrawer
          slug={timeline.slug}
          zoom={zoom}
          entryType={entryType}
          rangeLabel={rangeLabel}
        />
      </div>
    );
  }

  // Layout B: timeline is primary; right sticky panel contains About/Highlights/Filters.
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {timeline.title}
            </h1>
            <div className="mt-2">{viewSwitcher(timeline.slug, "B")}</div>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            href={`/t/${timeline.slug}/add`}
          >
            Add entry
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <TimelineRail
              timelineSlug={timeline.slug}
              zoom={zoom}
              groups={groups}
              groupKeys={groupKeys}
              sourcesByEntryId={sourcesByEntryId}
            />
          </div>
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <div className="flex flex-col gap-4">
              <AboutPanel
                title={timeline.title}
                description={timeline.description ?? ""}
              />
              <KeyMomentsStrip slug={timeline.slug} keyMoments={keyMoments} />
              <FiltersPanel
                slug={timeline.slug}
                zoom={zoom}
                entryType={entryType}
                rangeLabel={rangeLabel}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

