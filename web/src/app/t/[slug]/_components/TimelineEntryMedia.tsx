"use client";

import type { Media } from "../../../../lib/utils/media";
import { detectMediaFromResolvedMedia, detectMediaFromSources } from "../../../../lib/utils/media";
import type { ShapeVariant } from "./shapeStyles";
import { clipPathForShape } from "./shapeStyles";
import AutoPlayVideoController from "./AutoPlayVideoController";

export type { Media };
export { detectMediaFromResolvedMedia, detectMediaFromSources };

export default function TimelineEntryMedia({
  media,
  heightClassName,
  shape,
  entryId,
  variant = "preview",
}: {
  media: Media;
  heightClassName: string;
  shape: ShapeVariant;
  entryId: string;
  variant?: "preview" | "detail";
}) {
  if (media.kind === "none") return null;

  const isPreview = variant === "preview";

  // Media frame shape is picked per-entry to keep the timeline visually vibrant.
  // Deterministic hash ensures it stays stable across refresh/SSR.
  function stableIndex(seed: string, mod: number): number {
    // FNV-1a 32-bit (better spread than the old poly hash for UUID-like strings)
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h >>>= 0;
    return mod === 0 ? 0 : h % mod;
  }

  const imageShapes: ShapeVariant[] = ["rounded", "octagon", "diamond", "oval"];
  const videoShapes: ShapeVariant[] = ["rounded", "octagon", "diamond", "oval"];

  // Preview mode uses expressive shapes/frames. Detail mode uses a clean edge-to-edge
  // media surface with a small "Rekord" watermark.
  const mediaShape: ShapeVariant = isPreview
    ? media.kind === "image"
      ? imageShapes[
          stableIndex(`${entryId}:image:${media.url}`, imageShapes.length)
        ]!
      : media.kind === "video"
        ? videoShapes[
            stableIndex(`${entryId}:video:${media.url}`, videoShapes.length)
          ]!
        : shape
    : "rounded";

  const clipPath = isPreview ? clipPathForShape(mediaShape) : undefined;
  const radius = isPreview
    ? mediaShape === "oval"
      ? "rounded-full"
      : mediaShape === "rounded"
        ? "rounded-xl"
        : "rounded-[18px]"
    : "rounded-2xl";

  if (media.kind === "video") {
    const targetId = `video-preview-${entryId}`;
    const u = (media.url || "").toLowerCase();
    const sourceType = u.endsWith(".mp4")
      ? "video/mp4"
      : u.endsWith(".webm")
        ? "video/webm"
        : undefined;
    return (
      <div
        className={`mt-3 overflow-hidden ${isPreview ? "border border-zinc-200 dark:border-zinc-800" : ""} ${radius}`}
        style={clipPath ? ({ clipPath } as React.CSSProperties) : undefined}
      >
        <div id={targetId} className={`relative w-full ${heightClassName}`}>
          {media.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="video poster"
              className="absolute inset-0 h-full w-full object-cover opacity-90"
              src={media.posterUrl}
              loading="lazy"
            />
          ) : null}

          <video
            className="absolute inset-0 h-full w-full object-cover"
            poster={media.posterUrl}
            autoPlay={isPreview}
            muted={isPreview}
            playsInline
            loop={isPreview}
            preload="metadata"
            controls={!isPreview}
            disablePictureInPicture
          >
            <source src={media.url} {...(sourceType ? { type: sourceType } : {})} />
          </video>

          {isPreview ? (
            <>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-zinc-900">
                  ▶
                </span>
                <span className="text-xs font-medium text-white/90">Video</span>
              </div>
            </>
          ) : (
            <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-2 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur">
              Rekord
            </div>
          )}
        </div>
        {isPreview ? <AutoPlayVideoController targetId={targetId} /> : null}
      </div>
    );
  }

  if (media.kind === "audio") {
    return (
      <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Audio
        </div>
        <audio className="mt-2 w-full" src={media.url} controls preload="metadata" />
      </div>
    );
  }

  return (
    <div
      className={`mt-3 overflow-hidden ${isPreview ? "border border-zinc-200 dark:border-zinc-800" : ""} ${radius}`}
      style={clipPath ? ({ clipPath } as React.CSSProperties) : undefined}
    >
      <div className={`relative w-full ${heightClassName}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="entry media"
          className="absolute inset-0 h-full w-full object-cover"
          src={media.url}
          loading="lazy"
        />
        {!isPreview ? (
          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-2 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur">
            Rekord
          </div>
        ) : null}
      </div>
    </div>
  );
}

