import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import type { EntryType } from "../../../../lib/db/types";
import { hasPublicSupabaseEnv } from "../../../../lib/env";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  getFirstEntryTimeStart,
  listEntries,
  listKeyMoments,
  listMediaForEntries,
  listSourcesForEntries,
} from "../../../../lib/data/entries";
import {
  clampZoom,
  parseRange,
  toIso,
  type Zoom,
} from "../../../../lib/utils/time";
import { formatUtcTime } from "../../../../lib/utils/time";
import { isProbablyRtl } from "../../../../lib/utils/rtl";
import {
  getTimelineById,
  getTimelineBySlug,
} from "../../../../lib/data/timelines";
import type { Entry } from "../../../../lib/db/types";
import FiltersDrawer from "./FiltersDrawer";
import { env } from "../../../../lib/env";
import TimelineRailClient from "./TimelineRailClient";
import RememberFiltersClient from "./RememberFiltersClient";
import TimelineEntryCard from "./TimelineEntryCard";
import {
  cssVarsForTimelineThemeColors,
  themeColorsFromTimeline,
} from "../../../../lib/theme/timelineTheme";

export type TimelineLayoutVariant = "A" | "B";

function resolveTimelineMediaUrls(
  items: Array<{
    kind: string;
    storage_bucket: string;
    storage_path: string;
    variant?: string | null;
  }>,
): Array<{ kind: "image" | "video" | "audio"; url: string }> {
  const images = items.filter((m) => m.kind === "image");
  const audios = items.filter((m) => m.kind === "audio");
  const videos = items.filter((m) => m.kind === "video");

  const pickVideo =
    videos.find((v) => (v.variant ?? "original") === "optimized") ??
    videos.find((v) => (v.variant ?? "original") === "preview") ??
    null;

  const resolved: Array<{ kind: "image" | "video" | "audio"; url: string }> = [];
  const firstImage = images[0] ?? null;
  if (firstImage) {
    resolved.push({
      kind: "image",
      url: `${env.supabaseUrl}/storage/v1/object/public/${firstImage.storage_bucket}/${firstImage.storage_path}`,
    });
  }
  if (pickVideo) {
    resolved.push({
      kind: "video",
      url: `${env.supabaseUrl}/storage/v1/object/public/${pickVideo.storage_bucket}/${pickVideo.storage_path}`,
    });
  }
  const firstAudio = audios[0] ?? null;
  if (firstAudio) {
    resolved.push({
      kind: "audio",
      url: `${env.supabaseUrl}/storage/v1/object/public/${firstAudio.storage_bucket}/${firstAudio.storage_path}`,
    });
  }
  return resolved;
}

function clampEntryType(t?: string): EntryType | undefined {
  if (
    t === "evidence" ||
    t === "claim" ||
    t === "call_to_action"
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

// Layout A/B view switcher removed from UI for now.

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
  sourcesByEntryId,
  mediaByEntryId,
  zoom,
  canPin,
  pinnedEntryIds,
}: {
  slug: string;
  keyMoments: Entry[];
  sourcesByEntryId: Record<string, any[]>;
  mediaByEntryId: Record<string, Array<{ kind: "image" | "video" | "audio"; url: string }>>;
  zoom: Zoom;
  canPin: boolean;
  pinnedEntryIds: Set<string>;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      {/* Theme wash: primary base + secondary accents */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--tl-primary)_35%,transparent),transparent_55%,color-mix(in_oklab,var(--tl-primary)_28%,transparent))] opacity-70" />
        <div className="absolute inset-0 bg-[radial-gradient(520px_220px_at_18%_20%,color-mix(in_oklab,var(--tl-secondary)_28%,transparent)_0%,transparent_62%)] opacity-55" />
        <div className="absolute inset-0 bg-[radial-gradient(520px_220px_at_88%_0%,color-mix(in_oklab,var(--tl-secondary)_22%,transparent)_0%,transparent_62%)] opacity-45" />
      </div>

      <div className="relative flex items-center justify-between">
        <h2 className="text-sm font-semibold">Key moments</h2>
        <span className="text-xs text-zinc-300">
          {keyMoments.length ? `${keyMoments.length}` : "—"}
        </span>
      </div>
      {keyMoments.length ? (
        <div className="relative mt-3 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]" data-timeline-scroll>
          {keyMoments.slice(0, 10).map((e) => (
            <TimelineEntryCard
              key={e.id}
              timelineSlug={slug}
              entry={e}
              sources={(sourcesByEntryId as any)[e.id] ?? []}
              mediaItems={mediaByEntryId[e.id] ?? []}
              zoom={zoom}
              canPin={canPin}
              pinned={pinnedEntryIds.has(e.id)}
              showBranch={false}
              compact
              showType={false}
            />
          ))}
        </div>
      ) : (
        <div className="relative mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-200">
          No key moments yet. As the timeline owner, use the ☆ button on an entry to add it here.
        </div>
      )}
    </div>
  );
}

function RecentMomentsStrip({
  slug,
  entries,
  sourcesByEntryId,
  mediaByEntryId,
  zoom,
  canPin,
  pinnedEntryIds,
}: {
  slug: string;
  entries: Entry[];
  sourcesByEntryId: Record<string, any[]>;
  mediaByEntryId: Record<string, Array<{ kind: "image" | "video" | "audio"; url: string }>>;
  zoom: Zoom;
  canPin: boolean;
  pinnedEntryIds: Set<string>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Recent moments{" "}
          <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-medium text-zinc-200">
            today
          </span>
        </h2>
        <span className="text-xs text-zinc-300">{entries.length ? `${entries.length}` : "—"}</span>
      </div>
      {entries.length ? (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]" data-timeline-scroll>
          {entries.slice(0, 10).map((e) => (
            <TimelineEntryCard
              key={e.id}
              timelineSlug={slug}
              entry={e}
              sources={(sourcesByEntryId as any)[e.id] ?? []}
              mediaItems={mediaByEntryId[e.id] ?? []}
              zoom={zoom}
              canPin={canPin}
              pinned={pinnedEntryIds.has(e.id)}
              showBranch={false}
              compact
              showType={false}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-200">
          No posts yet today.
        </div>
      )}
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
          {(["evidence", "claim", "call_to_action"] as EntryType[]).map((t) => (
            <Link
              key={t}
              className={`rounded-full border px-3 py-1 ${
                entryType === t
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                  : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              }`}
              href={`/t/${slug}?z=${zoom}&type=${t}`}
            >
              {t === "call_to_action"
                ? "action"
                : t === "claim"
                  ? "opinion"
                  : t === "evidence"
                    ? "moment"
                    : t}
            </Link>
          ))}
        </div>

        <div className="text-xs text-zinc-600 dark:text-zinc-400">{rangeLabel}</div>
      </div>
    </details>
  );
}

export default async function TimelineView({
  slug,
  variant,
  searchParams,
}: {
  slug: string;
  variant: TimelineLayoutVariant;
  searchParams?: Promise<{
    z?: string;
    from?: string;
    to?: string;
    type?: string;
    after?: string;
  }>;
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
  if (!sp.from) {
    const first = await getFirstEntryTimeStart(timeline.id);
    if (first) {
      const d = new Date(first);
      if (!Number.isNaN(d.getTime())) range.from = d;
    }
  }
  const entryType = clampEntryType(sp.type);
  const sortOrder: "asc" | "desc" = "asc";
  const afterIso = sortOrder === "asc" ? sp.after : undefined;
  const pageLimit = 200;

  const [keyMoments, entries] = await Promise.all([
    listKeyMoments(timeline.id),
    listEntries({
      timelineId: timeline.id,
      fromIso: toIso(range.from),
      toIso: toIso(range.to),
      type: entryType,
      limit: pageLimit,
      afterIso,
      order: sortOrder,
    }),
  ]);
  // Key moments: show most recent moments first (by time_start).
  const keyMomentsSorted = [...keyMoments].sort(
    (a, b) => new Date(b.time_start).getTime() - new Date(a.time_start).getTime(),
  );
  const pinnedEntryIds = keyMomentsSorted.map((e) => e.id);
  const pinnedSet = new Set(pinnedEntryIds);

  const keyMomentIds = keyMomentsSorted.slice(0, 10).map((e) => e.id);
  const [kmSourcesByEntryId, kmMediaRawByEntryId] = await Promise.all([
    listSourcesForEntries(keyMomentIds),
    listMediaForEntries(keyMomentIds),
  ]);
  const kmSourcesObj = Object.fromEntries(kmSourcesByEntryId.entries());
  const kmMediaObj: Record<string, Array<{ kind: "image" | "video" | "audio"; url: string }>> =
    Object.fromEntries(
      Array.from(kmMediaRawByEntryId.entries()).map(([entryId, items]) => {
        return [entryId, resolveTimelineMediaUrls(items as any)];
      }),
    );

  // Recent (today) moments: always show what's posted today (UTC day).
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const todayEntries = await listEntries({
    timelineId: timeline.id,
    fromIso: toIso(todayStart),
    toIso: toIso(new Date(tomorrowStart.getTime() - 1)),
    limit: 50,
    order: "desc",
  });
  const todayEntriesNotPinned = todayEntries.filter((e) => !pinnedSet.has(e.id));
  const todayIds = todayEntriesNotPinned.slice(0, 10).map((e) => e.id);
  const [tdSourcesByEntryId, tdMediaRawByEntryId] = await Promise.all([
    listSourcesForEntries(todayIds),
    listMediaForEntries(todayIds),
  ]);
  const tdSourcesObj = Object.fromEntries(tdSourcesByEntryId.entries());
  const tdMediaObj: Record<string, Array<{ kind: "image" | "video" | "audio"; url: string }>> =
    Object.fromEntries(
      Array.from(tdMediaRawByEntryId.entries()).map(([entryId, items]) => {
        return [entryId, resolveTimelineMediaUrls(items as any)];
      }),
    );

  const entryIds = entries.map((e) => e.id);
  const [sourcesByEntryId, mediaRawByEntryId] = await Promise.all([
    listSourcesForEntries(entryIds),
    listMediaForEntries(entryIds),
  ]);

  const sourcesObj = Object.fromEntries(sourcesByEntryId.entries());
  const mediaObj: Record<string, Array<{ kind: "image" | "video" | "audio"; url: string }>> =
    Object.fromEntries(
      Array.from(mediaRawByEntryId.entries()).map(([entryId, items]) => {
        return [entryId, resolveTimelineMediaUrls(items as any)];
      }),
    );

  // Moment entries should not appear until they have at least a source OR media.
  // This prevents a “blank” moment showing before preview/media is attached.
  const visibleEntries = entries.filter((e) => {
    if (e.type !== "evidence") return true;
    const src = (sourcesObj as any)[e.id] ?? [];
    const media = (mediaObj as any)[e.id] ?? [];
    return (src?.length ?? 0) > 0 || (media?.length ?? 0) > 0;
  });

  const rangeLabel = `Showing up to 500 entries from ${range.from.toISOString()} to ${range.to.toISOString()}.`;
  const initialHasMore = entries.length === pageLimit;
  const themeColors = themeColorsFromTimeline(timeline);
  const themeVars = cssVarsForTimelineThemeColors(themeColors);
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const canEdit = Boolean(userData.user?.id && userData.user.id === timeline.created_by);
  const userId = userData.user?.id ?? null;

  // Layout A: compact sticky header + in-timeline highlights, filters via details.
  if (variant === "A") {
    return (
      <div
        className="dark relative min-h-screen bg-zinc-950 text-zinc-50"
        style={themeVars as React.CSSProperties}
      >
        <RememberFiltersClient
          timelineSlug={timeline.slug}
          userId={userId}
          zoom={zoom}
          entryType={entryType}
        />
        <div className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl items-start justify-between gap-4 px-6 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1
                  className="truncate text-base font-semibold tracking-tight sm:text-lg"
                  style={{ color: "var(--tl-text)" }}
                >
                  {timeline.title}
                </h1>
                {timeline.visibility !== "public" ? (
                  <span className="rounded-full border border-zinc-800 bg-zinc-950/50 px-2 py-0.5 text-xs font-medium text-zinc-200">
                    {timeline.visibility === "limited" ? "Pending" : "Private"}
                  </span>
                ) : null}
              </div>
              {timeline.description ? (
                <p className="mt-1 line-clamp-1 text-sm text-zinc-400">
                  {timeline.description}
                </p>
              ) : null}
              {timeline.visibility === "limited" ? (
                <div className="mt-2 rounded-xl border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                  Public listing requested. This timeline will appear publicly only after an admin
                  approves it.
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canEdit ? (
                <Link
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
                  href={`/t/${timeline.slug}/settings`}
                >
                  Edit timeline
                </Link>
              ) : null}
              <Link
                className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
                href={`/t/${timeline.slug}/add`}
                prefetch
              >
                Add entry
              </Link>
            </div>
          </div>
        </div>

        <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-6">
          <KeyMomentsStrip
            slug={timeline.slug}
            keyMoments={keyMomentsSorted}
            sourcesByEntryId={kmSourcesObj}
            mediaByEntryId={kmMediaObj}
            zoom={zoom}
            canPin={canEdit}
            pinnedEntryIds={new Set(pinnedEntryIds)}
          />
          <RecentMomentsStrip
            slug={timeline.slug}
            entries={todayEntriesNotPinned}
            sourcesByEntryId={tdSourcesObj}
            mediaByEntryId={tdMediaObj}
            zoom={zoom}
            canPin={canEdit}
            pinnedEntryIds={pinnedSet}
          />
          {visibleEntries.length === 0 ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight">No entries yet</h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    Be the first to add a moment. Add evidence (a link or media), a claim, or a call
                    to action—then zoom out to see the story build over time.
                  </p>
                </div>
                <Link
                  className="inline-flex shrink-0 items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                  href={`/t/${timeline.slug}/add`}
                >
                  Add the first entry
                </Link>
              </div>
            </section>
          ) : null}
          <TimelineRailClient
            timelineSlug={timeline.slug}
            zoom={zoom}
            entryType={entryType}
            fromIso={toIso(range.from)}
            toIso={toIso(range.to)}
            pageLimit={pageLimit}
            initialEntries={visibleEntries}
            initialSourcesByEntryId={sourcesObj}
            initialMediaByEntryId={mediaObj}
            initialHasMore={initialHasMore}
            canPin={canEdit}
            initialPinnedEntryIds={pinnedEntryIds}
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
    <div
      className="dark relative min-h-screen bg-zinc-950 text-zinc-50"
      style={themeVars as React.CSSProperties}
    >
      <RememberFiltersClient
        timelineSlug={timeline.slug}
        userId={userId}
        zoom={zoom}
        entryType={entryType}
      />
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {timeline.title}
            </h1>
            {/* view switcher removed */}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canEdit ? (
              <Link
                className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
                href={`/t/${timeline.slug}/settings`}
              >
                Edit timeline
              </Link>
            ) : null}
            <Link
              className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
              href={`/t/${timeline.slug}/add`}
              prefetch
            >
              Add entry
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            {visibleEntries.length === 0 ? (
              <section className="mb-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold tracking-tight">No entries yet</h2>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      Add the first moment to start the timeline. Moments can be a link or media;
                      claims and calls to action are also welcome.
                    </p>
                  </div>
                  <Link
                    className="inline-flex shrink-0 items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                    href={`/t/${timeline.slug}/add`}
                  >
                    Add the first entry
                  </Link>
                </div>
              </section>
            ) : null}
            <TimelineRailClient
              timelineSlug={timeline.slug}
              zoom={zoom}
              entryType={entryType}
              fromIso={toIso(range.from)}
              toIso={toIso(range.to)}
              pageLimit={pageLimit}
              initialEntries={visibleEntries}
              initialSourcesByEntryId={sourcesObj}
              initialMediaByEntryId={mediaObj}
              initialHasMore={initialHasMore}
              canPin={canEdit}
              initialPinnedEntryIds={pinnedEntryIds}
            />
          </div>
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <div className="flex flex-col gap-4">
              <AboutPanel
                title={timeline.title}
                description={timeline.description ?? ""}
              />
              <KeyMomentsStrip
                slug={timeline.slug}
                keyMoments={keyMomentsSorted}
                sourcesByEntryId={kmSourcesObj}
                mediaByEntryId={kmMediaObj}
                zoom={zoom}
                canPin={canEdit}
                pinnedEntryIds={new Set(pinnedEntryIds)}
              />
              <RecentMomentsStrip
                slug={timeline.slug}
                entries={todayEntriesNotPinned}
                sourcesByEntryId={tdSourcesObj}
                mediaByEntryId={tdMediaObj}
                zoom={zoom}
                canPin={canEdit}
                pinnedEntryIds={pinnedSet}
              />
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

