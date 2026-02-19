"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PickedFile = {
  file: File;
  originalId: string;
  role: "original";
};

type PreviewItem = {
  key: string;
  name: string;
  type: string;
  size: number;
  url: string;
  kind: "image" | "video" | "audio" | "file";
};

function originalIdForFile(f: File) {
  return `${f.name}-${f.size}-${f.lastModified}`;
}

function kindFromMime(mime: string): PreviewItem["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

export default function MediaPicker({
  accept,
  onPickedChange,
}: {
  accept: string;
  onPickedChange?: (picked: PickedFile[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [picked, setPicked] = useState<PickedFile[]>([]);

  const previews = useMemo<PreviewItem[]>(() => {
    return picked.map((pf, idx) => {
      const f = pf.file;
      const url = URL.createObjectURL(f);
      return {
        key: `${idx}-${pf.originalId}`,
        name: f.name,
        type: f.type || "application/octet-stream",
        size: f.size,
        url,
        kind: kindFromMime(f.type || ""),
      };
    });
  }, [picked]);

  useEffect(() => {
    onPickedChange?.(picked);
  }, [picked, onPickedChange]);

  useEffect(() => {
    return () => {
      for (const p of previews) URL.revokeObjectURL(p.url);
    };
  }, [previews]);

  return (
    <div>
      <input
        ref={inputRef}
        className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
        id="media"
        type="file"
        accept={accept}
        multiple
        onChange={(e) => {
          const list = Array.from(e.currentTarget.files ?? []);
          const originals: PickedFile[] = list.map((f) => ({
            file: f,
            originalId: originalIdForFile(f),
            role: "original",
          }));
          setPicked(originals);
        }}
      />

      {previews.length ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {previews.map((p) => (
            <div
              key={p.key}
              className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <button
                type="button"
                className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/55 text-xs font-semibold text-white backdrop-blur hover:bg-black/70"
                aria-label={`Remove ${p.name}`}
                onClick={() => {
                  setPicked((prev) => {
                    const next = prev.filter((pf, i) => `${i}-${pf.originalId}` !== p.key);
                    if (inputRef.current) inputRef.current.value = "";
                    return next;
                  });
                }}
              >
                ×
              </button>
              <div className="aspect-video bg-zinc-100 dark:bg-zinc-950">
                {p.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                ) : p.kind === "video" ? (
                  <video
                    src={p.url}
                    className="h-full w-full object-cover"
                    muted
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : p.kind === "audio" ? (
                  <div className="flex h-full w-full items-center justify-center p-3">
                    <audio src={p.url} controls preload="metadata" />
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-3 text-xs text-zinc-600 dark:text-zinc-300">
                    File
                  </div>
                )}
              </div>
              <div className="p-2">
                <div className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  {p.name}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                  {Math.max(1, Math.round(p.size / 1024))} KB
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

