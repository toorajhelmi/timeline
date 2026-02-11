import Link from "next/link";

import type { Entry, EntryType, Source, Zoom } from "../../../../lib/db/types";
import TimelineEntryMedia, {
  detectMediaFromSources,
} from "./TimelineEntryMedia";
import { gradientForEntryType, shapeForEntryType } from "./shapeStyles";

function densityFromZoom(zoom: Zoom) {
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

function badgeForType(type: EntryType): string {
  return type;
}

export default function TimelineEntryCard({
  timelineSlug,
  entry,
  sources,
  zoom,
}: {
  timelineSlug: string;
  entry: Entry;
  sources: Source[];
  zoom: Zoom;
}) {
  const shape = shapeForEntryType(entry.type);
  const density = densityFromZoom(zoom);
  const media = detectMediaFromSources(sources);

  const disputed = entry.status === "disputed";

  return (
    <div className={`group relative ${density.minWidth} pt-8`}>
      {/* Branch dot + stem */}
      <div className="pointer-events-none absolute left-[-18px] top-[22px] h-[10px] w-[10px] rounded-full bg-zinc-900 dark:bg-white" />
      <div className="pointer-events-none absolute left-[-14px] top-[26px] h-5 w-px bg-zinc-200 dark:bg-zinc-800" />

      <Link
        href={`/t/${timelineSlug}/e/${entry.id}`}
        className={`relative block rounded-2xl border bg-white p-4 transition will-change-transform hover:-translate-y-0.5 hover:shadow-xl dark:bg-zinc-900 ${
          disputed
            ? "border-amber-300/80 shadow-amber-500/10 dark:border-amber-900/40"
            : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
        }`}
      >
        {/* Gradient smear */}
        <div
          className={`pointer-events-none absolute -inset-10 -z-10 bg-gradient-to-r ${gradientForEntryType(
            entry.type,
          )} opacity-70 blur-2xl`}
        />

        {/* Jagged-ish accent for disputed (subtle) */}
        {disputed && (
          <div className="pointer-events-none absolute left-0 right-0 top-0 h-2 bg-[repeating-linear-gradient(90deg,rgba(245,158,11,0.0)_0px,rgba(245,158,11,0.0)_6px,rgba(245,158,11,0.35)_6px,rgba(245,158,11,0.35)_10px)]" />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {badgeForType(entry.type)}
            </span>
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              {new Date(entry.time_start).toISOString()}
            </span>
          </div>

          <div className="flex items-center gap-2">
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
            {sources.length ? (
              <span className="hidden rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 group-hover:inline-flex dark:border-zinc-800 dark:text-zinc-400">
                {sources.length} sources
              </span>
            ) : null}
          </div>
        </div>

        <TimelineEntryMedia
          media={media}
          heightClassName={density.mediaHeight}
          shape={shape}
          entryId={entry.id}
        />

        {entry.title ? (
          <div className="mt-3 text-sm font-semibold">{entry.title}</div>
        ) : null}
        <div
          className={`mt-1 text-sm text-zinc-700 dark:text-zinc-300 ${density.bodyLines}`}
        >
          {entry.body}
        </div>
      </Link>
    </div>
  );
}

