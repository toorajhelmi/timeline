"use client";

import Link from "next/link";

import type { Entry, EntryType, Source, Zoom } from "../../../../lib/db/types";
import { formatUtcTime } from "../../../../lib/utils/time";
import { isProbablyRtl } from "../../../../lib/utils/rtl";
import TimelineEntryMedia, {
  detectMediaFromResolvedMedia,
  detectMediaFromSources,
} from "./TimelineEntryMedia";
import { gradientForEntryType, shapeForEntryType } from "./shapeStyles";
import ShareMenu from "../../../_components/ShareMenu";

function densityFromZoom(zoom: Zoom) {
  // "compact" is used for small strips (Key moments / Recent moments).
  // It intentionally stays readable but takes less horizontal space.
  if (zoom === "day" || zoom === "week") {
    return {
      minWidth: "min-w-[340px] max-w-[460px]",
      mediaHeight: "h-40",
      bodyLines: "line-clamp-3",
    };
  }
  return {
    minWidth: "min-w-[280px] max-w-[420px]",
    mediaHeight: "h-28",
    bodyLines: "line-clamp-2",
  };
}

function compactDensity() {
  return {
    minWidth: "min-w-[240px] max-w-[320px]",
    mediaHeight: "h-24",
    bodyLines: "line-clamp-2",
  };
}

function badgeForType(type: EntryType): string {
  if (type === "call_to_action") return "action";
  if (type === "claim") return "opinion";
  if (type === "evidence") return "moment";
  return type;
}

function stripAutoCollectedBoilerplate(body: string): string {
  const POSTER_HANDLE_RE = /^\s*@?ill?iaen@?\s*$/i;
  const POSTER_PREFIX_RE = /^\s*@?ill?iaen@?\s*[:\-–—]?\s*/i;

  const lines = body
    .split("\n")
    .map((l) => l.trim())
    // Remove known poster handle prefixes like "illiaen@".
    .map((l) => l.replace(POSTER_PREFIX_RE, "").trim())
    .filter(Boolean);

  const filtered = lines.filter((l) => {
    const s = l.toLowerCase();
    // Remove poster handle lines like "@iliaen" / "illiaen@".
    if (POSTER_HANDLE_RE.test(s)) return false;
    if (s.startsWith("auto-collected:")) return false;
    if (s.startsWith("auto collected:")) return false;
    if (s.startsWith("auto-collected article")) return false;
    if (s.startsWith("domain:")) return false;
    if (s.startsWith("source country:")) return false;
    if (s.startsWith("note: this entry is auto-collected")) return false;
    if (s.startsWith("telegram message")) return false;
    return true;
  });

  return filtered.join("\n");
}

export default function TimelineEntryCard({
  timelineSlug,
  entry,
  sources,
  mediaItems,
  zoom,
  canPin = false,
  pinned = false,
  onTogglePin,
  showBranch = true,
  compact = false,
  showType = true,
}: {
  timelineSlug: string;
  entry: Entry;
  sources: Source[];
  mediaItems: Array<{ kind: "image" | "video" | "audio"; url: string }>;
  zoom: Zoom;
  canPin?: boolean;
  pinned?: boolean;
  onTogglePin?: (nextPinned: boolean) => void;
  showBranch?: boolean;
  compact?: boolean;
  showType?: boolean;
}) {
  const shape = shapeForEntryType(entry.type);
  const density = compact ? compactDensity() : densityFromZoom(zoom);
  const media =
    mediaItems.length > 0
      ? detectMediaFromResolvedMedia(mediaItems)
      : detectMediaFromSources(sources);

  const disputed = entry.status === "disputed";
  // Don't fall back to the original body if stripping removes everything;
  // otherwise placeholders like "Telegram message." reappear.
  const displayBody = stripAutoCollectedBoilerplate(entry.body);
  const displayBodyTrimmed = displayBody.trim();
  const titleDir: "rtl" | "ltr" = entry.title && isProbablyRtl(entry.title) ? "rtl" : "ltr";
  const bodyDir: "rtl" | "ltr" = displayBodyTrimmed && isProbablyRtl(displayBodyTrimmed) ? "rtl" : "ltr";

  const outerPt = showBranch ? "pt-8" : compact ? "pt-2" : "pt-4";

  return (
    <div className={`group relative ${density.minWidth} ${outerPt}`}>
      {/* Branch dot + stem */}
      {showBranch ? (
        <>
          <div
            className="pointer-events-none absolute left-[-20px] top-[20px] h-[12px] w-[12px] rounded-full border"
            style={{
              backgroundColor: "var(--tl-card-bg)",
              borderColor: "color-mix(in oklab, var(--tl-rail) 70%, transparent)",
            }}
          />
          <div
            className="pointer-events-none absolute left-[-14px] top-[26px] h-5 w-px"
            style={{ backgroundColor: "var(--tl-rail)" }}
          />
        </>
      ) : null}

      <div
        className={`relative isolate overflow-hidden rounded-2xl bg-[color:var(--tl-card-bg)] p-4 transition hover:shadow-xl dark:bg-[color:var(--tl-card-bg-dark)] ${
          disputed ? "shadow-amber-500/10" : ""
        }`}
      >
        {/* Full-card link overlay (keeps buttons outside <a>) */}
        <Link
          href={`/t/${timelineSlug}/e/${entry.id}`}
          className="absolute inset-0 z-10 rounded-2xl"
          aria-label="Open entry"
        >
          <span className="sr-only">Open entry</span>
        </Link>

        {/* Entry-type tint (subtle) */}
        <div
          className={`pointer-events-none absolute inset-0 z-0 bg-gradient-to-br ${gradientForEntryType(
            entry.type,
          )} opacity-[0.06] dark:opacity-[0.10]`}
        />

        {/* Jagged-ish accent for disputed (subtle) */}
        {disputed && (
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-2 bg-[repeating-linear-gradient(90deg,rgba(245,158,11,0.0)_0px,rgba(245,158,11,0.0)_6px,rgba(245,158,11,0.35)_6px,rgba(245,158,11,0.35)_10px)]" />
        )}

        <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div className="flex items-center gap-2">
            {showType ? (
              <span className="rounded-full bg-[color:var(--tl-badge-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--tl-badge-fg)] dark:bg-[color:var(--tl-badge-bg-dark)] dark:text-[color:var(--tl-badge-fg-dark)]">
                {badgeForType(entry.type)}
              </span>
            ) : null}
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-xs text-zinc-100">
              {formatUtcTime(entry.time_start)}
            </span>
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            {canPin ? (
              <button
                type="button"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
                  pinned
                    ? "border-amber-300/40 bg-amber-400/15 text-amber-200 hover:bg-amber-400/20"
                    : "border-zinc-400/30 bg-zinc-950/20 text-zinc-200 hover:bg-zinc-950/30"
                }`}
                title={pinned ? "Unpin from highlights" : "Pin to highlights"}
                onClick={(e) => {
                  onTogglePin?.(!pinned);
                }}
              >
                {pinned ? "★" : "☆"}
              </button>
            ) : null}
            {entry.is_locked && (
              <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                locked
              </span>
            )}
            {entry.status !== "active" && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  entry.status === "disputed"
                    ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {entry.status}
              </span>
            )}
          </div>
        </div>

        <div className="relative z-20 pointer-events-none">
          <TimelineEntryMedia
            media={media}
            heightClassName={density.mediaHeight}
            shape={shape}
            entryId={entry.id}
            variant="preview"
          />
        </div>

        <div className="relative z-20 pointer-events-none">
          {entry.title ? (
            <div
              className={`mt-3 text-sm font-semibold text-[color:var(--tl-text)] ${titleDir === "rtl" ? "text-right" : ""}`}
              dir={titleDir}
            >
              {entry.title}
            </div>
          ) : null}
          {displayBodyTrimmed ? (
            <div
              className={`mt-1 text-sm text-[color:var(--tl-text)] opacity-90 ${density.bodyLines} ${
                bodyDir === "rtl" ? "text-right" : ""
              }`}
              dir={bodyDir}
            >
              {displayBodyTrimmed}
            </div>
          ) : null}
        </div>

        {/* Footer meta (reserved space; no layout shift on hover) */}
        <div className="relative z-20 mt-3 flex min-h-[20px] items-center justify-between pointer-events-none">
          <div
            className={`text-[11px] text-zinc-200/80 transition-opacity ${
              sources.length ? "opacity-0 group-hover:opacity-100" : "opacity-0"
            }`}
          >
            {sources.length ? `${sources.length} sources` : ""}
          </div>
          <div className="pointer-events-auto opacity-0 transition-opacity group-hover:opacity-100">
            <ShareMenu
              path={`/t/${timelineSlug}/e/${entry.id}`}
              title={entry.title ?? null}
              body={displayBodyTrimmed}
              variant="icon"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

