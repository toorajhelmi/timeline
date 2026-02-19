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
import fixWebmDuration from "fix-webm-duration";

import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type UploadStatus = "queued" | "uploading" | "done" | "error" | "cancelled";

type UploadStage = "preview_record" | "poster_upload" | "preview_upload" | "full_upload";

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
  stage?: UploadStage | null;
  stageStartedAt?: number | null;
  stageTotalMs?: number | null;
  stageBytesUploaded?: number | null;
  stageBytesTotal?: number | null;
  // Preview-pipeline progress (0→1) for the 1-min “record + upload preview” UX.
  previewProgress01?: number | null;
  // Optional override for showing a stage-based progress bar (e.g. 50% recording, 50% uploading).
  progress01?: number | null;
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
  hidden: boolean;
  setHidden: (v: boolean) => void;
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
  if (typeof t.progress01 === "number" && Number.isFinite(t.progress01)) {
    const raw = t.progress01 * 100;
    if (raw > 0 && raw < 1) return 1;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }
  if (!t.bytesTotal) return null;
  const raw = (t.bytesUploaded / t.bytesTotal) * 100;
  if (!Number.isFinite(raw)) return null;
  if (t.bytesUploaded > 0 && raw < 1) return 1;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function pctForBytesOnly(t: UploadTask): number | null {
  if (!t.bytesTotal) return null;
  const raw = (t.bytesUploaded / t.bytesTotal) * 100;
  if (!Number.isFinite(raw)) return null;
  if (t.bytesUploaded > 0 && raw < 1) return 1;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function formatEtaHHMM(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

function isAbortError(err: any): boolean {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return (
    msg === "aborted" ||
    msg.includes("aborted") ||
    msg.includes("abort") ||
    msg.includes("cancel") ||
    msg.includes("canceled") ||
    msg.includes("user_canceled")
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
        // Don't "terminate" the upload on Supabase Storage.
        // Supabase's TUS endpoint can respond 409 to DELETE terminate requests,
        // which shows up as an uncaught DetailedError in the console.
        // A plain abort reliably stops the client-side upload without noisy errors.
        upload.abort(false);
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
    if (!ctx) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
      try {
        video.remove();
      } catch {
        // ignore
      }
      return null;
    }
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
    const canMp4Aac =
      MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E,mp4a.40.2") ||
      MediaRecorder.isTypeSupported('video/mp4;codecs="avc1.42E01E,mp4a.40.2"') ||
      MediaRecorder.isTypeSupported("video/mp4");
    const canVp9 = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus");
    const canVp8 = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus");
    const canWebm = MediaRecorder.isTypeSupported("video/webm");
    const mimeType = canMp4Aac
      ? "video/mp4;codecs=avc1.42E01E,mp4a.40.2"
      : canVp9
      ? "video/webm;codecs=vp9,opus"
      : canVp8
        ? "video/webm;codecs=vp8,opus"
        : canWebm
          ? "video/webm"
          : "";
    if (!mimeType) return null;
    const baseMime = mimeType.split(";")[0] ?? "video/webm";
    const ext = baseMime === "video/mp4" ? ".mp4" : ".webm";

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = objectUrl;
    // Ensure playback can start in background without user gesture.
    // We'll capture audio via WebAudio/captureStream rather than relying on speakers output.
    video.muted = true;
    video.volume = 1;
    video.playsInline = true;
    video.preload = "auto";
    try {
      // Improves reliability of playback/decoding in some browsers.
      video.style.position = "fixed";
      video.style.left = "-9999px";
      video.style.top = "0";
      video.style.width = "1px";
      video.style.height = "1px";
      video.style.opacity = "0";
      document.body.appendChild(video);
    } catch {
      // ignore
    }

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video_metadata_error"));
    });

    const duration = Number(video.duration || 0);
    // Only extract a 1-min preview for 3min+ videos (per spec).
    if (!Number.isFinite(duration) || duration < 180) {
      URL.revokeObjectURL(objectUrl);
      try {
        video.remove();
      } catch {
        // ignore
      }
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
    let ac: AudioContext | null = null;
    let cleanupAudio: (() => void) | null = null;
    try {
      ac = new (window.AudioContext || (window as any).webkitAudioContext)();
      const src = ac.createMediaElementSource(video);
      const dest = ac.createMediaStreamDestination();

      // Route element audio into a capturable MediaStreamDestination.
      src.connect(dest);

      // Keep strong refs until the end, then close.
      cleanupAudio = () => {
        try {
          src.disconnect();
        } catch {
          // ignore
        }
        try {
          dest.disconnect();
        } catch {
          // ignore
        }
        try {
          void ac?.close();
        } catch {
          // ignore
        }
      };

      // Some browsers start AudioContext suspended; best-effort resume.
      try {
        await ac.resume();
      } catch {
        // ignore
      }

      const audioTracks = dest.stream.getAudioTracks();
      // Prefer audio from the element playback stream if available (more reliable across codecs),
      // otherwise fall back to the WebAudio destination track.
      let elAudio: MediaStreamTrack | null = null;
      try {
        const cap =
          (video as any).captureStream ??
          (video as any).mozCaptureStream ??
          null;
        const s: MediaStream | null = typeof cap === "function" ? (cap.call(video) as MediaStream) : null;
        elAudio = s?.getAudioTracks?.()[0] ?? null;
      } catch {
        elAudio = null;
      }

      const aTrack = elAudio ?? audioTracks[0] ?? null;
      combined = aTrack
        ? new MediaStream([...canvasStream.getVideoTracks(), aTrack])
        : canvasStream;
    } catch {
      combined = canvasStream;
    }

    if (combined.getVideoTracks().length === 0) return null;
    const rec = new MediaRecorder(combined, {
      mimeType,
      videoBitsPerSecond: 1_100_000,
      audioBitsPerSecond: 96_000,
    } as any);
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

    // Start playback muted (autoplay-safe), then unmute so audio actually flows into the
    // MediaElementSource → MediaStreamDestination graph (we are NOT connected to speakers).
    try {
      await video.play();
    } catch {
      // If playback can't start, preview generation can't proceed.
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ignore
      }
      try {
        cleanupAudio?.();
      } catch {
        // ignore
      }
      try {
        video.remove();
      } catch {
        // ignore
      }
      return null;
    }

    // Once playback has started, unmute so audio frames are produced.
    // (Because we don't connect to `ac.destination`, nothing plays out loud.)
    try {
      video.muted = false;
    } catch {
      // ignore
    }
    await sleepMs(60);

    const startedAt = performance.now();
    rec.start(500);
    requestAnimationFrame(draw);

    await sleepMs(targetSeconds * 1000);

    rec.stop();
    video.pause();
    URL.revokeObjectURL(objectUrl);
    try {
      cleanupAudio?.();
    } catch {
      // ignore
    }
    try {
      video.remove();
    } catch {
      // ignore
    }

    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });

    const rawBlob = new Blob(chunks, { type: baseMime });
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    const blob =
      baseMime === "video/webm"
        ? // Fix MediaRecorder WebM duration metadata. Without this, the native video progress
          // bar can “race”, slow down, and even jump backwards as the browser refines duration.
          await fixWebmDuration(rawBlob, durationMs)
        : rawBlob;
    if (blob.size < 1024 * 16) return null;
    return new File([blob], `__rekord_1min__${file.name}${ext}`, {
      type: baseMime,
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

function mediaSignal(entryId: string, info?: { kind?: string; variant?: string }) {
  try {
    window.dispatchEvent(
      new CustomEvent("rekord:media", {
        detail: { entryId, kind: info?.kind ?? null, variant: info?.variant ?? null },
      }),
    );
  } catch {
    // ignore
  }
}

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [minimized, setMinimized] = useState(true);
  const [hidden, setHidden] = useState(false);

  const tasksRef = useRef<UploadTask[]>([]);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const aborters = useRef<Map<string, AbortController>>(new Map());
  const fileMap = useRef<Map<string, File>>(new Map());
  const running = useRef(false);

  const setTasksSync = useCallback((fn: (prev: UploadTask[]) => UploadTask[]) => {
    setTasks((prev) => {
      const next = fn(prev);
      tasksRef.current = next;
      return next;
    });
  }, []);

  const cancel = useCallback((taskId: string) => {
    aborters.current.get(taskId)?.abort();
    fileMap.current.delete(taskId);
    aborters.current.delete(taskId);
    setTasksSync((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: "cancelled", note: "Cancelled", error: null } : t,
      ),
    );
  }, [setTasksSync]);

  const enqueue = useCallback((input: EnqueueInput) => {
    const id = uuid();
    const f = input.file;
    fileMap.current.set(id, f);
    setTasksSync((prev) => [
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
        stage: null,
        stageStartedAt: null,
        stageTotalMs: null,
        stageBytesUploaded: null,
        stageBytesTotal: null,
        previewProgress01: null,
        progress01: null,
        error: null,
      },
    ]);
  }, [setTasksSync]);

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
      setTasksSync((prev) =>
        prev.filter((t) => !(t.status === "done" || t.status === "cancelled")),
      );
    }, 3000);
    return () => window.clearTimeout(id);
  }, [tasks, setTasksSync]);

  const pump = useCallback(async () => {
    if (running.current) return;
    if (!tasksRef.current.some((t) => t.status === "queued")) return;
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
          const queued = tasksRef.current.filter((t) => t.status === "queued");
          queued.sort((a, b) => a.createdAt - b.createdAt);
          return queued[0] ?? null;
        })();

        if (!next) break;

        const file = fileMap.current.get(next.id);
        if (!file) {
          setTasksSync((prev) =>
            prev.map((t) =>
              t.id === next.id ? { ...t, status: "error", error: "missing_file_handle" } : t,
            ),
          );
          continue;
        }

        setTasksSync((prev) =>
          prev.map((t) =>
            t.id === next.id && t.status !== "cancelled"
              ? { ...t, status: "uploading" }
              : t,
          ),
        );

        const aborter = new AbortController();
        aborters.current.set(next.id, aborter);

        let updateUploadStageProgress: (() => void) | null = null;
        let fullUploadedBytes = 0;

        try {
          // For original videos, generate poster + 1-min preview first (if applicable).
          if (next.kind === "video" && next.variant === "original") {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === next.id
                  ? {
                      ...t,
                      note: "Preparing preview…",
                      previewProgress01: Math.max(0.01, t.previewProgress01 ?? 0),
                      progress01: Math.max(0.01, t.progress01 ?? 0),
                    }
                  : t,
              ),
            );

            const poster = await generateVideoPosterWebp(file);
            if (poster) {
              setTasks((prev) =>
                prev.map((t) =>
                  t.id === next.id
                    ? { ...t, previewProgress01: Math.max(0.05, t.previewProgress01 ?? 0), progress01: Math.max(0.05, t.progress01 ?? 0) }
                    : t,
                ),
              );
            }

            // 0→50%: deterministic 1-minute preview recording (time-based).
            setTasks((prev) =>
              prev.map((t) =>
                t.id === next.id
                  ? {
                      ...t,
                      note: "Recording 1-min preview…",
                      stage: "preview_record",
                      stageStartedAt: Date.now(),
                      stageTotalMs: 60_000,
                      stageBytesUploaded: null,
                      stageBytesTotal: null,
                      previewProgress01: Math.max(0, t.previewProgress01 ?? 0),
                      progress01: Math.max(0.05, t.progress01 ?? 0),
                    }
                  : t,
              ),
            );
            const recordStartedAt = Date.now();
            const expectedRecordMs = 60_000;
            const recTimer = window.setInterval(() => {
              const elapsed = Date.now() - recordStartedAt;
              const frac = Math.max(0, Math.min(1, elapsed / expectedRecordMs));
              const p = 0.5 * frac; // 0% → 50%
              setTasks((prev) =>
                prev.map((t) =>
                  t.id === next.id && t.status === "uploading"
                    ? { ...t, previewProgress01: Math.max(p, t.previewProgress01 ?? 0) }
                    : t,
                ),
              );
            }, 500);

            let preview: File | null = null;
            try {
              preview = await generateVideoPreviewWebmWithAudio(file);
            } finally {
              window.clearInterval(recTimer);
              setTasks((prev) =>
                prev.map((t) =>
                  t.id === next.id
                    ? {
                        ...t,
                        note: "Preparing uploads…",
                        previewProgress01: Math.max(0.5, t.previewProgress01 ?? 0),
                        progress01: Math.max(0.5, t.progress01 ?? 0),
                      }
                    : t,
                ),
              );
            }

            // 50→100%: uploading stage (poster + preview + full upload).
            const previewStageTotal = (poster?.size ?? 0) + (preview?.size ?? 0);
            let posterUploadedBytes = 0;
            let previewUploadedBytes = 0;
            updateUploadStageProgress = () => {
              // Overall upload progress (includes full upload).
              const uploadStageTotal = (poster?.size ?? 0) + (preview?.size ?? 0) + (file.size ?? 0);
              if (uploadStageTotal) {
                const stageUploadedBytes = posterUploadedBytes + previewUploadedBytes + fullUploadedBytes;
                const frac = Math.max(0, Math.min(1, stageUploadedBytes / uploadStageTotal));
                const p = 0.5 + 0.5 * frac;
                setTasks((prev) =>
                  prev.map((t) =>
                    t.id === next.id && t.status === "uploading"
                      ? { ...t, progress01: Math.max(p, t.progress01 ?? 0) }
                      : t,
                  ),
                );
              }

              // 1-min preview pipeline progress: 50→100% based only on poster+preview uploads.
              if (previewStageTotal) {
                const stageUploadedBytes = posterUploadedBytes + previewUploadedBytes;
                const frac = Math.max(0, Math.min(1, stageUploadedBytes / previewStageTotal));
                const p = 0.5 + 0.5 * frac;
                setTasks((prev) =>
                  prev.map((t) =>
                    t.id === next.id && t.status === "uploading"
                      ? { ...t, previewProgress01: Math.max(p, t.previewProgress01 ?? 0) }
                      : t,
                  ),
                );
              }
            };

            if (poster) {
              setTasks((prev) =>
                prev.map((t) =>
                  t.id === next.id
                    ? {
                        ...t,
                        note: "Uploading poster…",
                        stage: "poster_upload",
                        stageStartedAt: Date.now(),
                        stageTotalMs: null,
                        stageBytesUploaded: 0,
                        stageBytesTotal: poster.size ?? null,
                      }
                    : t,
                ),
              );
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
                  onProgress: (bytesUploaded, bytesTotal) => {
                    posterUploadedBytes = bytesUploaded;
                    setTasks((prev) =>
                      prev.map((t) =>
                        t.id === next.id && t.status === "uploading"
                          ? {
                              ...t,
                              stage: "poster_upload",
                              stageBytesUploaded: bytesUploaded,
                              stageBytesTotal: bytesTotal,
                            }
                          : t,
                      ),
                    );
                    updateUploadStageProgress?.();
                  },
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
              mediaSignal(next.entryId, { kind: "image", variant: "poster" });
            }

            if (preview) {
              setTasks((prev) =>
                prev.map((t) =>
                  t.id === next.id
                    ? {
                        ...t,
                        note: "Uploading 1-min preview…",
                        stage: "preview_upload",
                        stageStartedAt: Date.now(),
                        stageTotalMs: null,
                        stageBytesUploaded: 0,
                        stageBytesTotal: preview.size ?? null,
                      }
                    : t,
                ),
              );
              const isMp4 = preview.type === "video/mp4" || preview.name.toLowerCase().endsWith(".mp4");
              const previewPath = `${next.timelineSlug}/${next.entryId}/${uuid()}${isMp4 ? ".mp4" : ".webm"}`;
              await withTransientRetries(() =>
                uploadViaTus({
                  supabaseUrl: env.supabaseUrl,
                  supabaseAnonKey: env.supabaseAnonKey,
                  accessToken,
                  bucketName: next.storageBucket,
                  objectName: previewPath,
                  file: preview,
                  cacheControlSeconds: 31536000,
                  onProgress: (bytesUploaded, bytesTotal) => {
                    previewUploadedBytes = bytesUploaded;
                    setTasks((prev) =>
                      prev.map((t) =>
                        t.id === next.id && t.status === "uploading"
                          ? {
                              ...t,
                              stage: "preview_upload",
                              stageBytesUploaded: bytesUploaded,
                              stageBytesTotal: bytesTotal,
                            }
                          : t,
                      ),
                    );
                    updateUploadStageProgress?.();
                  },
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
              mediaSignal(next.entryId, { kind: "video", variant: "preview" });
              // For the 1-min pipeline indicator, we're done once preview uploads.
              setTasks((prev) =>
                prev.map((t) =>
                  t.id === next.id && t.status === "uploading"
                    ? { ...t, previewProgress01: Math.max(1, t.previewProgress01 ?? 0) }
                    : t,
                ),
              );

              // Once the 1-min preview is ready, auto-hide the widget (upload continues).
              window.setTimeout(() => setMinimized(true), 4000);
            } else {
              // If preview generation fails (codec/MediaRecorder limitations), don't leave the
              // publishing overlay waiting forever. The UI can fall back to waiting for full upload.
              mediaSignal(next.entryId, { kind: "video", variant: "preview_skipped" });
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
                if (next.kind === "video" && next.variant === "original") {
                  fullUploadedBytes = bytesUploaded;
                  updateUploadStageProgress?.();
                  setTasks((prev) =>
                    prev.map((t) =>
                      t.id === next.id && t.status === "uploading"
                        ? {
                            ...t,
                            stage: "full_upload",
                            stageBytesUploaded: bytesUploaded,
                            stageBytesTotal: bytesTotal,
                          }
                        : t,
                    ),
                  );
                }
                setTasks((prev) =>
                  prev.map((t) =>
                    t.id === next.id
                      ? t.status !== "uploading"
                        ? t
                        : {
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
          mediaSignal(next.entryId, { kind: next.kind, variant: next.variant });

          setTasksSync((prev) =>
            prev.map((t) =>
              t.id === next.id ? { ...t, status: "done", note: "Upload complete" } : t,
            ),
          );
          fileMap.current.delete(next.id);
        } catch (e: any) {
          const msg = String(e?.message ?? e ?? "error");
          const aborted = aborter.signal.aborted || isAbortError(e);
          setTasksSync((prev) =>
            prev.map((t) => {
              if (t.id !== next.id) return t;
              // If user already cancelled, don't overwrite.
              if (t.status === "cancelled") return t;
              if (aborted) return { ...t, status: "cancelled", note: "Cancelled", error: null };
              return { ...t, status: "error", error: msg, note: null };
            }),
          );
        } finally {
          aborters.current.delete(next.id);
        }
      }
    } finally {
      running.current = false;
    }
  }, [setTasksSync]);

  useEffect(() => {
    if (!tasks.some((t) => t.status === "queued")) return;
    void pump();
  }, [tasks, pump]);

  const api = useMemo<UploadQueueApi>(
    () => ({ tasks, minimized, setMinimized, hidden, setHidden, enqueue, cancel }),
    [tasks, minimized, hidden, enqueue, cancel],
  );

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
  const { tasks, minimized, setMinimized, hidden, cancel } = useUploadQueue();
  const active = tasks.filter((t) => isActive(t.status));
  const last = active[0] ?? tasks[tasks.length - 1] ?? null;

  if (hidden || !last) return null;
  // If user cancelled and nothing else is active, hide immediately.
  if (active.length === 0 && last.status === "cancelled") return null;

  // Prefer real byte progress (matches the displayed "X / Y MB") over any stage-based progress.
  const pct =
    last.status === "uploading" ? (pctForBytesOnly(last) ?? pctFor(last)) : null;
  const indeterminate = last.status === "uploading" && (pct === null || pct === 0) && !!last.note;

  const speedRef = useRef<{
    taskId: string | null;
    lastBytes: number;
    lastTs: number;
    bps: number | null;
  }>({ taskId: null, lastBytes: 0, lastTs: 0, bps: null });

  useEffect(() => {
    if (last.status !== "uploading") return;
    if (!last.bytesTotal) return;

    const now = Date.now();
    const cur = speedRef.current;

    if (cur.taskId !== last.id) {
      speedRef.current = {
        taskId: last.id,
        lastBytes: last.bytesUploaded ?? 0,
        lastTs: now,
        bps: null,
      };
      return;
    }

    const dtMs = now - cur.lastTs;
    const db = (last.bytesUploaded ?? 0) - cur.lastBytes;
    if (dtMs < 300 || db <= 0) return;

    const instBps = db / (dtMs / 1000);
    const prev = cur.bps;
    const nextBps = prev && Number.isFinite(prev) ? prev * 0.85 + instBps * 0.15 : instBps;
    speedRef.current = {
      taskId: last.id,
      lastBytes: last.bytesUploaded ?? 0,
      lastTs: now,
      bps: nextBps,
    };
  }, [last.id, last.status, last.bytesUploaded, last.bytesTotal]);

  const etaText = useMemo(() => {
    if (last.status !== "uploading") return null;
    if (!last.bytesTotal) return null;
    const remainingBytes = Math.max(0, (last.bytesTotal ?? 0) - (last.bytesUploaded ?? 0));
    if (remainingBytes <= 0) return "00:00";
    const bps = speedRef.current.bps;
    if (!bps || !Number.isFinite(bps) || bps <= 0) return null;
    const seconds = remainingBytes / bps;
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return formatEtaHHMM(seconds);
  }, [last.status, last.bytesUploaded, last.bytesTotal]);

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[120] flex items-end gap-2">
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
          {last.status === "uploading" && typeof pct === "number" ? (
            <div className="mt-2 text-sm font-black tabular-nums text-pink-400">{pct}%</div>
          ) : null}
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

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          <div>
            {last.bytesTotal
              ? `${Math.round(last.bytesUploaded / (1024 * 1024))} / ${Math.round(last.bytesTotal / (1024 * 1024))} MB`
              : ""}
          </div>
          {last.status === "uploading" && typeof pct === "number" ? (
            <div className="tabular-nums">{pct}%</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {indeterminate ? (
            <div className="text-[11px] font-medium text-zinc-400">Working…</div>
          ) : last.status === "uploading" && etaText ? (
            <div
              className="text-lg font-black tabular-nums text-pink-400"
              title="Estimated time remaining (HH:MM)"
            >
              {etaText}
            </div>
          ) : null}
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

