import type { Source } from "../db/types";

export type Media =
  | { kind: "image"; url: string }
  | { kind: "video"; url: string; posterUrl?: string }
  | { kind: "audio"; url: string }
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

function isLikelyAudioUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.endsWith(".mp3") || u.endsWith(".wav") || u.endsWith(".ogg") || u.endsWith(".m4a") || u.endsWith(".aac");
}

export function detectMediaFromSources(sources: Source[]): Media {
  const image = sources.find((s) => isLikelyImageUrl(s.url));
  const video = sources.find((s) => isLikelyVideoUrl(s.url));
  const audio = sources.find((s) => isLikelyAudioUrl(s.url));
  if (video) return { kind: "video", url: video.url, posterUrl: image?.url };
  if (image) return { kind: "image", url: image.url };
  if (audio) return { kind: "audio", url: audio.url };
  return { kind: "none" };
}

export function detectMediaFromResolvedMedia(
  items: Array<{ kind: "image" | "video" | "audio"; url: string }>,
): Media {
  const image = items.find((m) => m.kind === "image");
  const video = items.find((m) => m.kind === "video");
  const audio = items.find((m) => m.kind === "audio");
  if (video) return { kind: "video", url: video.url, posterUrl: image?.url };
  if (image) return { kind: "image", url: image.url };
  if (audio) return { kind: "audio", url: audio.url };
  return { kind: "none" };
}

