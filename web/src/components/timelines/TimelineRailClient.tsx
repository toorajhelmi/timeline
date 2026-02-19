"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { Entry, EntryType, Source } from "@/lib/db/types";
import { bucketLabel, type Zoom } from "@/lib/utils/time";
import TimelineEntryCard from "./TimelineEntryCard";

type MediaItem = { kind: "image" | "video" | "audio"; url: string };

type ApiResponse =
  | {
      ok: true;
      entries: Entry[];
      sourcesByEntryId: Record<string, Source[]>;
      mediaByEntryId: Record<string, MediaItem[]>;
      hasMore: boolean;
      nextAfter: string | null;
    }
  | { ok: false; error: string };

export default function TimelineRailClient({
  timelineSlug,
  zoom,
  entryType,
  fromIso,
  toIso,
  pageLimit,
  initialEntries,
  initialSourcesByEntryId,
  initialMediaByEntryId,
  initialHasMore,
  canPin,
  initialPinnedEntryIds,
}: {
  timelineSlug: string;
  zoom: Zoom;
  entryType?: EntryType;
  fromIso: string;
  toIso: string;
  pageLimit: number;
  initialEntries: Entry[];
  initialSourcesByEntryId: Record<string, Source[]>;
  initialMediaByEntryId: Record<string, MediaItem[]>;
  initialHasMore: boolean;
  canPin?: boolean;
  initialPinnedEntryIds?: string[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [sourcesByEntryId, setSourcesByEntryId] = useState<Record<string, Source[]>>(
    initialSourcesByEntryId,
  );
  const [mediaByEntryId, setMediaByEntryId] = useState<Record<string, MediaItem[]>>(
    initialMediaByEntryId,
  );
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(
    () => new Set((initialPinnedEntryIds ?? []).filter(Boolean)),
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const after = entries.length ? entries[entries.length - 1]!.time_start : null;

  const grouped = useMemo(() => {
    const groups = new Map<string, Entry[]>();
    for (const e of entries) {
      const key = bucketLabel(zoom, e.time_start);
      const list = groups.get(key);
      if (list) list.push(e);
      else groups.set(key, [e]);
    }
    const keys = Array.from(groups.keys()).sort();
    return { groups, keys };
  }, [entries, zoom]);

  async function togglePinned(entryId: string, nextPinned: boolean) {
    try {
      setPinned((prev) => {
        const n = new Set(prev);
        if (nextPinned) n.add(entryId);
        else n.delete(entryId);
        return n;
      });

      const res = await fetch(`/api/timelines/${encodeURIComponent(timelineSlug)}/key-moments`, {
        method: nextPinned ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      // revert on error
      setPinned((prev) => {
        const n = new Set(prev);
        if (nextPinned) n.delete(entryId);
        else n.add(entryId);
        return n;
      });
      setError(String((e as Error)?.message ?? e));
    } finally {
      // keep highlights reasonably up to date (server-rendered strip).
      router.refresh();
    }
  }

  async function loadMore() {
    if (!hasMore) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("from", fromIso);
      params.set("to", toIso);
      params.set("limit", String(pageLimit));
      if (entryType) params.set("type", entryType);
      if (after) params.set("after", after);

      const res = await fetch(
        `/api/timelines/${encodeURIComponent(timelineSlug)}/entries?${params.toString()}`,
        {
        cache: "no-store",
        },
      );
      const j = (await res.json()) as ApiResponse;
      if (!j || !("ok" in j) || !j.ok) {
        throw new Error((j as any)?.error ?? `HTTP ${res.status}`);
      }

      // Append entries; server returns sorted asc for the page.
      setEntries((prev) => [...prev, ...j.entries]);
      setSourcesByEntryId((prev) => ({ ...prev, ...j.sourcesByEntryId }));
      setMediaByEntryId((prev) => ({ ...prev, ...j.mediaByEntryId }));
      setHasMore(Boolean(j.hasMore));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }

  // Auto-load more when sentinel is in view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entriesObs) => {
        const any = entriesObs.some((x) => x.isIntersecting);
        if (any) loadMore();
      },
      { root: null, rootMargin: "800px 0px", threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentinelRef.current, hasMore, after, entryType, fromIso, toIso, pageLimit, timelineSlug]);

  return (
    <section className="flex flex-col gap-6">
      {grouped.keys.map((k) => {
        const group = grouped.groups.get(k)!;
        return (
          <div key={k} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium tracking-wide text-zinc-400/90">
                {k}
              </h2>
              <span className="text-[11px] text-zinc-400/80">
                {group.length} items
              </span>
            </div>
            <div className="relative mt-2 pl-8">
              {/* Simple rail + branch (secondary color) */}
              <div
                className="pointer-events-none absolute bottom-0 left-[9px] top-0 w-px"
                style={{ backgroundColor: "var(--tl-rail)" }}
              />
              <div
                className="pointer-events-none absolute left-[2px] top-[18px] h-[16px] w-[16px] rounded-full border bg-[color:var(--tl-card-bg)] dark:bg-[color:var(--tl-card-bg-dark)]"
                style={{
                  borderColor: "color-mix(in oklab, var(--tl-rail) 55%, transparent)",
                }}
              />
              <div
                className="pointer-events-none absolute left-[9px] right-0 top-[26px] h-px"
                style={{ backgroundColor: "var(--tl-rail)" }}
              />

              <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]" data-timeline-scroll>
                {group.map((e) => (
                  <TimelineEntryCard
                    key={e.id}
                    timelineSlug={timelineSlug}
                    entry={e}
                    sources={sourcesByEntryId[e.id] ?? []}
                    mediaItems={mediaByEntryId[e.id] ?? []}
                    zoom={zoom}
                    canPin={Boolean(canPin)}
                    pinned={pinned.has(e.id)}
                    onTogglePin={(next) => togglePinned(e.id, next)}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <div ref={sentinelRef} />

      {loadingMore ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-200">
          Loading more…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          Failed to load more: {error}
          <div className="mt-2">
            <button
              type="button"
              className="rounded-xl bg-rose-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-800 dark:bg-rose-200 dark:text-rose-900 dark:hover:bg-rose-300"
              onClick={() => loadMore()}
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {!hasMore && entries.length ? (
        <div className="text-center text-xs text-zinc-400/70">End of loaded range.</div>
      ) : null}
    </section>
  );
}

