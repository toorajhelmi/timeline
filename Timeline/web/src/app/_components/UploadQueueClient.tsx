"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Upload } from "tus-js-client";

import { env } from "../../lib/env";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

type UploadStatus = "queued" | "uploading" | "done" | "error" | "cancelled";

export type UploadTask = {
  id: string;
  createdAt: number;
  timelineSlug: string;
  entryId: string;
  fileName: string;
  mimeType: string;
  bytesTotal: number;
  bytesUploaded: number;
  storageBucket: string;
  storagePath: string;
  variant: "original" | "preview" | "poster";
  kind: "image" | "video" | "audio" | "file";
  status: UploadStatus;
  note?: string | null;
  error?: string | null;
};

type EnqueueInput = {
  timelineSlug: string;
  entryId: string;
  file: File;
  storageBucket: string;
  storagePath: string;
  kind: UploadTask["kind"];
  variant: UploadTask["variant"];
};

type UploadQueueApi = {
  tasks: UploadTask[];
  minimized: boolean;
  setMinimized: (v: boolean) => void;
  enqueue: (input: EnqueueInput) => void;
  cancel: (taskId: string) => void;
};

const Ctx = createContext<UploadQueueApi | null>(null);

function uuid(): string {
  try {
    const c: any = (globalThis as any).crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch {
    // ignore
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function storageTusEndpointFromSupabaseUrl(supabaseUrl: string): string {
  const u = new URL(supabaseUrl);
  const host = u.host.replace(".supabase.co", ".storage.supabase.co");
  return `${u.protocol}//${host}/storage/v1/upload/resumable`;
}

function isActive(status: UploadStatus) {
  return status === "queued" || status === "uploading";
}

function pctFor(t: UploadTask): number | null {
  if (!t.bytesTotal) return null;
  const raw = (t.bytesUploaded / t.bytesTotal) * 100;
  if (!Number.isFinite(raw)) return null;
  if (t.bytesUploaded > 0 && raw < 1) return 1;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

async function sleepMs(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function isTransientUploadError(err: any): boolean {
  const msg = String(err?.message ?? err ?? "");
  return (
    msg.includes("ERR_NETWORK_CHANGED") ||
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("timeout") ||
    msg.includes("ECONN") ||
    msg.includes("503") ||
    msg.includes("502")
  );
}

async function withTransientRetries<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastErr: any = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransientUploadError(e) || i === tries - 1) throw e;
      await sleepMs(700 * Math.pow(2, i));
    }
  }
  throw lastErr;
}

async function uploadViaTus(params: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken: string;
  bucketName: string;
  objectName: string;
  file: File;
  cacheControlSeconds: number;
  onProgress: (bytesUploaded: number, bytesTotal: number) => void;
  signal: AbortSignal;
}): Promise<void> {
  const endpoint = storageTusEndpointFromSupabaseUrl(params.supabaseUrl);

  return await new Promise<void>((resolve, reject) => {
    if (params.signal.aborted) return reject(new Error("aborted"));

    const upload = new Upload(params.file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${params.accessToken}`,
        apikey: params.supabaseAnonKey,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: async (file) =>
        // Prevent resuming to a different entry/path when uploading the same file again.
        [`rekord`, file.name, file.size, file.lastModified, params.objectName].join("::"),
      metadata: {
        bucketName: params.bucketName,
        objectName: params.objectName,
        contentType: params.file.type || "application/octet-stream",
        cacheControl: String(params.cacheControlSeconds),
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => params.onProgress(bytesUploaded, bytesTotal),
      onSuccess: () => resolve(),
    });

    const abort = () => {
      try {
        upload.abort(true);
      } catch {
        // ignore
      }
      reject(new Error("aborted"));
    };
    params.signal.addEventListener("abort", abort, { once: true });

    upload
      .findPreviousUploads()
      .then((prev) => {
        if (params.signal.aborted) return abort();
        if (prev.length) upload.resumeFromPreviousUpload(prev[0]!);
        upload.start();
      })
      .catch((e) => reject(e));
  });
}

async function generateVideoPosterWebp(file: File): Promise<File | null> {
  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video_metadata_error"));
    });

    const w = Math.max(1, video.videoWidth || 1);
    const h = Math.max(1, video.videoHeight || 1);
    const targetW = Math.min(960, w);
    const targetH = Math.max(1, Math.round((h / w) * targetW));

    try {
      video.currentTime = Math.min(0.3, Math.max(0, (video.duration || 0) * 0.02));
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        window.setTimeout(() => resolve(), 350);
      });
    } catch {
      // ignore
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    try {
      ctx.drawImage(video, 0, 0, targetW, targetH);
    } catch {
      // ignore
    }
    URL.revokeObjectURL(url);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", 0.82),
    );
    if (!blob || blob.size < 1024) return null;
    return new File([blob], `__rekord_poster__${file.name}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

async function generateVideoPreviewWebmWithAudio(file: File): Promise<File | null> {
  try {
    if (typeof MediaRecorder === "undefined") return null;
    const canVp9 = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus");
    const canVp8 = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus");
    const canWebm = MediaRecorder.isTypeSupported("video/webm");
    const mimeType = canVp9
      ? "video/webm;codecs=vp9,opus"
      : canVp8
        ? "video/webm;codecs=vp8,opus"
        : canWebm
          ? "video/webm"
          : "";
    if (!mimeType) return null;

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = objectUrl;
    video.muted = false;
    video.playsInline = true;
    video.preload = "metadata";

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video_metadata_error"));
    });

    const duration = Number(video.duration || 0);
    // Only extract a 1-min preview for 3min+ videos (per spec).
    if (!Number.isFinite(duration) || duration < 180) {
      URL.revokeObjectURL(objectUrl);
      return null;
    }

    const targetSeconds = 60;
    const srcW = Math.max(1, video.videoWidth || 1);
    const srcH = Math.max(1, video.videoHeight || 1);
    const targetW = Math.min(720, srcW);
    const targetH = Math.max(1, Math.round((srcH / srcW) * targetW));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const fps = 20;
    const canvasStream = canvas.captureStream(fps);

    let combined: MediaStream = canvasStream;
    try {
      const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
      const src = ac.createMediaElementSource(video);
      const dest = ac.createMediaStreamDestination();
      src.connect(dest);
      src.connect(ac.destination);
      combined = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    } catch {
      combined = canvasStream;
    }

    const rec = new MediaRecorder(combined, { mimeType });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const draw = () => {
      try {
        ctx.drawImage(video, 0, 0, targetW, targetH);
      } catch {
        // ignore
      }
      if (!video.paused && !video.ended) requestAnimationFrame(draw);
    };

    rec.start(500);
    await video.play();
    requestAnimationFrame(draw);

    await sleepMs(targetSeconds * 1000);

    rec.stop();
    video.pause();
    URL.revokeObjectURL(objectUrl);

    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });

    const blob = new Blob(chunks, { type: "video/webm" });
    if (blob.size < 1024 * 16) return null;
    return new File([blob], `__rekord_1min__${file.name}.webm`, {
      type: "video/webm",
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

function mediaSignal(entryId: string) {
  try {
    window.dispatchEvent(new CustomEvent("rekord:media", { detail: { entryId } }));
  } catch {
    // ignore
  }
}

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [minimized, setMinimized] = useState(true);

  const aborters = useRef<Map<string, AbortController>>(new Map());
  const fileMap = useRef<Map<string, File>>(new Map());
  const running = useRef(false);

  const cancel = useCallback((taskId: string) => {
    aborters.current.get(taskId)?.abort();
    fileMap.current.delete(taskId);
    aborters.current.delete(taskId);
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: "cancelled" } : t)),
    );
  }, []);

  const enqueue = useCallback((input: EnqueueInput) => {
    const id = uuid();
    const f = input.file;
    fileMap.current.set(id, f);
    setTasks((prev) => [
      ...prev,
      {
        id,
        createdAt: Date.now(),
        timelineSlug: input.timelineSlug,
        entryId: input.entryId,
        fileName: f.name || "file",
        mimeType: f.type || "application/octet-stream",
        bytesTotal: f.size ?? 0,
        bytesUploaded: 0,
        storageBucket: input.storageBucket,
        storagePath: input.storagePath,
        kind: input.kind,
        variant: input.variant,
        status: "queued",
        note: null,
        error: null,
      },
    ]);
  }, []);

  // Warn on tab close when active.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!tasks.some((t) => isActive(t.status))) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [tasks]);

  // Auto-prune completed/cancelled uploads so end-users don't need a "clear" button.
  useEffect(() => {
    if (!tasks.some((t) => t.status === "done" || t.status === "cancelled")) return;
    const id = window.setTimeout(() => {
      setTasks((prev) => prev.filter((t) => !(t.status === "done" || t.status === "cancelled")));
    }, 3000);
    return () => window.clearTimeout(id);
  }, [tasks]);

  const pump = useCallback(async () => {
    if (running.current) return;
    if (!tasks.some((t) => t.status === "queued")) return;
    running.current = true;

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const userId = sessionData.session?.user?.id ?? null;
      if (!accessToken || !userId) throw new Error("missing_session");
      if (!env.supabaseUrl || !env.supabaseAnonKey) throw new Error("missing_supabase_env");

      while (true) {
        const next = (() => {
          const queued = tasks.filter((t) => t.status === "queued");
          queued.sort((a, b) => a.createdAt - b.createdAt);
          return queued[0] ?? null;
        })();

        if (!next) break;

        const file = fileMap.current.get(next.id);
        if (!file) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === next.id ? { ...t, status: "error", error: "missing_file_handle" } : t,
            ),
          );
          continue;
        }

        setTasks((prev) => prev.map((t) => (t.id === next.id ? { ...t, status: "uploading" } : t)));

        const aborter = new AbortController();
        aborters.current.set(next.id, aborter);

        try {
          // For original videos, generate poster + 1-min preview first (if applicable).
          if (next.kind === "video" && next.variant === "original") {
            setTasks((prev) => prev.map((t) => (t.id === next.id ? { ...t, note: "Preparing preview…" } : t)));

            const poster = await generateVideoPosterWebp(file);
            const preview = await generateVideoPreviewWebmWithAudio(file);

            if (poster) {
              setTasks((prev) => prev.map((t) => (t.id === next.id ? { ...t, note: "Uploading poster…" } : t)));
              const posterPath = `${next.timelineSlug}/${next.entryId}/${uuid()}.webp`;
              await withTransientRetries(() =>
                uploadViaTus({
                  supabaseUrl: env.supabaseUrl,
                  supabaseAnonKey: env.supabaseAnonKey,
                  accessToken,
                  bucketName: next.storageBucket,
                  objectName: posterPath,
                  file: poster,
                  cacheControlSeconds: 31536000,
                  onProgress: () => {},
                  signal: aborter.signal,
                }),
              );
              await supabase.from("entry_media").insert({
                entry_id: next.entryId,
                kind: "image",
                storage_bucket: next.storageBucket,
                storage_path: posterPath,
                variant: "poster",
                original_url: null,
                mime_type: poster.type,
                bytes: poster.size,
                uploaded_by: userId,
              } as any);
              mediaSignal(next.entryId);
            }

            if (preview) {
              setTasks((prev) => prev.map((t) => (t.id === next.id ? { ...t, note: "Uploading 1-min preview…" } : t)));
              const previewPath = `${next.timelineSlug}/${next.entryId}/${uuid()}.webm`;
              await withTransientRetries(() =>
                uploadViaTus({
                  supabaseUrl: env.supabaseUrl,
                  supabaseAnonKey: env.supabaseAnonKey,
                  accessToken,
                  bucketName: next.storageBucket,
                  objectName: previewPath,
                  file: preview,
                  cacheControlSeconds: 31536000,
                  onProgress: () => {},
                  signal: aborter.signal,
                }),
              );
              await supabase.from("entry_media").insert({
                entry_id: next.entryId,
                kind: "video",
                storage_bucket: next.storageBucket,
                storage_path: previewPath,
                variant: "preview",
                original_url: null,
                mime_type: preview.type,
                bytes: preview.size,
                uploaded_by: userId,
              } as any);
              mediaSignal(next.entryId);

              // Once the 1-min preview is ready, auto-hide the widget (upload continues).
              window.setTimeout(() => setMinimized(true), 4000);
            }

            setTasks((prev) => prev.map((t) => (t.id === next.id ? { ...t, note: "Starting full upload…" } : t)));
          }

          await withTransientRetries(() =>
            uploadViaTus({
              supabaseUrl: env.supabaseUrl,
              supabaseAnonKey: env.supabaseAnonKey,
              accessToken,
              bucketName: next.storageBucket,
              objectName: next.storagePath,
              file,
              cacheControlSeconds: 31536000,
              onProgress: (bytesUploaded, bytesTotal) => {
                setTasks((prev) =>
                  prev.map((t) =>
                    t.id === next.id
                      ? {
                          ...t,
                          bytesUploaded,
                          bytesTotal,
                          note:
                            next.kind === "video" && next.variant === "original"
                              ? "Uploading full video…"
                              : null,
                        }
                      : t,
                  ),
                );
              },
              signal: aborter.signal,
            }),
          );

          await supabase.from("entry_media").insert({
            entry_id: next.entryId,
            kind: next.kind,
            storage_bucket: next.storageBucket,
            storage_path: next.storagePath,
            variant: next.variant,
            original_url: null,
            mime_type: next.mimeType,
            bytes: next.bytesTotal,
            uploaded_by: userId,
          } as any);
          mediaSignal(next.entryId);

          setTasks((prev) => prev.map((t) => (t.id === next.id ? { ...t, status: "done", note: "Upload complete" } : t)));
          fileMap.current.delete(next.id);
        } catch (e: any) {
          const msg = String(e?.message ?? e ?? "error");
          setTasks((prev) =>
            prev.map((t) =>
              t.id === next.id
                ? { ...t, status: msg === "aborted" ? "cancelled" : "error", error: msg, note: null }
                : t,
            ),
          );
        } finally {
          aborters.current.delete(next.id);
        }
      }
    } finally {
      running.current = false;
    }
  }, [tasks]);

  useEffect(() => {
    void pump();
  }, [pump]);

  const api = useMemo<UploadQueueApi>(() => ({ tasks, minimized, setMinimized, enqueue, cancel }), [tasks, minimized, enqueue, cancel]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useUploadQueue() {
  const v = useContext(Ctx);
  if (!v) throw new Error("UploadQueueProvider missing");
  return v;
}

function PinkK({ text }: { text: string }) {
  const idx = text.indexOf("K");
  if (idx === -1) return <span>{text}</span>;
  return (
    <span className="font-black tracking-[0.18em]">
      {text.slice(0, idx)}
      <span className="text-pink-400">{text[idx]}</span>
      {text.slice(idx + 1)}
    </span>
  );
}

export function UploadQueueWidget() {
  const { tasks, minimized, setMinimized, cancel } = useUploadQueue();
  const active = tasks.filter((t) => isActive(t.status));
  const last = active[0] ?? tasks[tasks.length - 1] ?? null;

  if (!last) return null;

  const pct = last.status === "uploading" ? pctFor(last) : null;
  const indeterminate = last.status === "uploading" && (pct === null || pct === 0) && !!last.note;

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[120]">
        <button
          type="button"
          className="rounded-2xl border border-white/10 bg-zinc-950/80 px-4 py-3 text-left text-xs text-zinc-100 shadow-2xl backdrop-blur hover:bg-zinc-950/90"
          onClick={() => setMinimized(false)}
        >
          <div className="font-black tracking-[0.18em]">
            <PinkK text="reKord" />
          </div>
          <div className="mt-1 text-[11px] text-zinc-300">
            {last.status === "done" ? "Upload complete" : last.note ?? "Uploading…"}
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[120] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-zinc-950/85 p-4 text-zinc-100 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black tracking-[0.18em]">
            <PinkK text="reKord" />
          </div>
          <div className="mt-1 truncate text-xs text-zinc-200">
            {last.note ? last.note : last.status === "done" ? "Upload complete" : "Uploading…"}
          </div>
          <div className="mt-1 truncate text-[11px] text-zinc-400">{last.fileName}</div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/5"
            onClick={() => setMinimized(true)}
          >
            Hide
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          {indeterminate ? (
            <div className="h-full w-1/2 animate-pulse rounded-full bg-white/25" />
          ) : (
            <div className="h-full rounded-full bg-white/70 transition-[width]" style={{ width: `${pct ?? 0}%` }} />
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
          <span>
            {last.bytesTotal
              ? `${Math.round(last.bytesUploaded / (1024 * 1024))} / ${Math.round(last.bytesTotal / (1024 * 1024))} MB`
              : ""}
          </span>
          {last.status === "uploading" ? (
            <button
              type="button"
              className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/5"
              onClick={() => cancel(last.id)}
              title="Stop this upload"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

