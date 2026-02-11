import type { Source } from "../../../../lib/db/types";
import type { ShapeVariant } from "./shapeStyles";
import { clipPathForShape } from "./shapeStyles";
import AutoPlayVideoController from "./AutoPlayVideoController";

export type Media =
  | { kind: "image"; url: string }
  | { kind: "video"; url: string; posterUrl?: string }
  | { kind: "none" };

function isLikelyImageUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.endsWith(".png") ||
    u.endsWith(".jpg") ||
    u.endsWith(".jpeg") ||
    u.endsWith(".webp") ||
    u.endsWith(".gif") ||
    u.includes("images.unsplash.com/") ||
    u.includes("picsum.photos/")
  );
}

function isLikelyVideoUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".mov");
}

export function detectMediaFromSources(sources: Source[]): Media {
  const image = sources.find((s) => isLikelyImageUrl(s.url));
  const video = sources.find((s) => isLikelyVideoUrl(s.url));
  if (video) return { kind: "video", url: video.url, posterUrl: image?.url };
  if (image) return { kind: "image", url: image.url };
  return { kind: "none" };
}

export default function TimelineEntryMedia({
  media,
  heightClassName,
  shape,
  entryId,
}: {
  media: Media;
  heightClassName: string;
  shape: ShapeVariant;
  entryId: string;
}) {
  if (media.kind === "none") return null;

  // Media frame shape is picked per-entry to keep the timeline visually vibrant.
  // Deterministic hash ensures it stays stable across refresh/SSR.
  function stableIndex(seed: string, mod: number): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return mod === 0 ? 0 : h % mod;
  }

  const imageShapes: ShapeVariant[] = ["rounded", "octagon", "diamond", "oval"];
  const videoShapes: ShapeVariant[] = ["rounded", "octagon", "diamond"];

  const mediaShape: ShapeVariant =
    media.kind === "image"
      ? imageShapes[stableIndex(`${entryId}:image`, imageShapes.length)]!
      : media.kind === "video"
        ? videoShapes[stableIndex(`${entryId}:video`, videoShapes.length)]!
        : shape;

  const clipPath = clipPathForShape(mediaShape);
  const radius =
    mediaShape === "oval"
      ? "rounded-full"
      : mediaShape === "rounded"
        ? "rounded-xl"
        : "rounded-[18px]";

  if (media.kind === "video") {
    const targetId = `video-preview-${entryId}`;
    return (
      <div
        className={`mt-3 overflow-hidden border border-zinc-200 dark:border-zinc-800 ${radius}`}
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
            src={media.url}
            poster={media.posterUrl}
            autoPlay
            muted
            playsInline
            loop
            preload="metadata"
            controls={false}
            disablePictureInPicture
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-zinc-900">
              ▶
            </span>
            <span className="text-xs font-medium text-white/90">Video</span>
          </div>
        </div>
        <AutoPlayVideoController targetId={targetId} />
      </div>
    );
  }

  return (
    <div
      className={`mt-3 overflow-hidden border border-zinc-200 dark:border-zinc-800 ${radius}`}
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
      </div>
    </div>
  );
}

