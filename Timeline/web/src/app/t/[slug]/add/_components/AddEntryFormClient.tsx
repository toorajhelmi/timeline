"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { EntryType } from "../../../../../lib/db/types";
import { createSupabaseBrowserClient } from "../../../../../lib/supabase/browser";
import { useUploadQueue } from "@/app/_components/UploadQueueClient";
import EntryTypePicker from "./EntryTypePicker";
import MediaPicker, { type PickedFile } from "./MediaPicker";
import TimeRangePicker from "./TimeRangePicker";

type Phase = "idle" | "creating" | "queued" | "error";
type WaitWant = "preview" | "original_video" | "any" | null;

type Draft = {
  type: "evidence" | "claim" | "call_to_action";
  title: string;
  body: string;
  sourceUrl: string;
  timeStartLocal: string;
  timeEndLocal: string;
};

function draftKey(timelineSlug: string) {
  return `rekord:add-draft:${timelineSlug}`;
}

function PinkK({ text }: { text: string }) {
  const idx = text.indexOf("K");
  if (idx === -1) return <span>{text}</span>;
  return (
    <span className="font-black tracking-[0.2em]">
      {text.slice(0, idx)}
      <span className="text-pink-400">{text[idx]}</span>
      {text.slice(idx + 1)}
    </span>
  );
}

function clampEntryType(t?: string): EntryType {
  if (t === "evidence" || t === "claim" || t === "call_to_action") return t;
  return "claim";
}

function extFromName(name: string): string {
  const n = String(name ?? "");
  const i = n.lastIndexOf(".");
  if (i === -1) return "";
  const e = n.slice(i).slice(0, 12);
  return /^[\.\w-]+$/.test(e) ? e : "";
}

function uuid(): string {
  try {
    const c: any = (globalThis as any).crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch {
    // ignore
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function kindFromMime(mime: string) {
  const m = String(mime ?? "");
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

function nowLocalInputValue(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();
  return local.slice(0, 16);
}

async function getVideoDurationSeconds(file: File): Promise<number | null> {
  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video_metadata_error"));
    });
    const d = Number(video.duration || 0);
    URL.revokeObjectURL(url);
    if (!Number.isFinite(d) || d <= 0) return null;
    return d;
  } catch {
    return null;
  }
}

async function waitForEntryMedia(params: {
  supabase: ReturnType<typeof createSupabaseBrowserClient>;
  entryId: string;
  want: "preview" | "original_video" | "any";
  timeoutMs: number;
}): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < params.timeoutMs) {
    const q = params.supabase
      .from("entry_media")
      .select("id,kind,variant,created_at")
      .eq("entry_id", params.entryId)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data, error } = await q;
    if (error) {
      // transient read errors happen during auth/session transitions; keep trying briefly
      await new Promise((r) => setTimeout(r, 600));
      continue;
    }

    const rows = (data ?? []) as Array<{ kind: string; variant?: string | null }>;
    if (params.want === "any") {
      if (rows.length > 0) return;
    } else if (params.want === "preview") {
      if (rows.some((r) => r.kind === "video" && (r.variant ?? "original") === "preview")) return;
    } else {
      if (rows.some((r) => r.kind === "video" && (r.variant ?? "original") === "original")) return;
    }

    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error(params.want === "preview" ? "preview_timeout" : "media_timeout");
}

async function waitForMediaSignal(params: {
  entryId: string;
  want: "preview" | "original_video" | "any";
  timeoutMs: number;
}): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    let done = false;
    let tid: number | undefined;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (tid) window.clearTimeout(tid);
      window.removeEventListener("rekord:media", onAny as any);
      resolve(ok);
    };

    const onAny = (ev: Event) => {
      try {
        const e = ev as CustomEvent<any>;
        const d = e.detail ?? {};
        if (d.entryId !== params.entryId) return;
        const kind = String(d.kind ?? "");
        const variant = String(d.variant ?? "");
        if (params.want === "any") return finish(true);
        if (params.want === "preview") {
          if (kind === "video" && variant === "preview_skipped") return finish(false);
          if (kind === "video" && variant === "preview") return finish(true);
        } else {
          if (kind === "video" && variant === "original") return finish(true);
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener("rekord:media", onAny as any);
    tid = window.setTimeout(() => finish(false), params.timeoutMs);
  });
}

export default function AddEntryFormClient({
  timelineId,
  timelineSlug,
}: {
  timelineId: string;
  timelineSlug: string;
}) {
  const router = useRouter();
  const { enqueue, setMinimized, setHidden, tasks, cancel } = useUploadQueue();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [createdEntryId, setCreatedEntryId] = useState<string | null>(null);
  const [waitWant, setWaitWant] = useState<WaitWant>(null);
  const [queuedTick, setQueuedTick] = useState(0);
  const [typeValue, setTypeValue] = useState<Draft["type"]>("evidence");
  const [titleValue, setTitleValue] = useState("");
  const [bodyValue, setBodyValue] = useState("");
  const [sourceUrlValue, setSourceUrlValue] = useState("");
  const [timeStartLocal, setTimeStartLocal] = useState<string>(() => nowLocalInputValue());
  const [timeEndLocal, setTimeEndLocal] = useState<string>("");

  const originalsCount = useMemo(
    () => picked.filter((p) => p.role === "original").length,
    [picked],
  );

  const previewCountdownDisplay = useMemo(() => {
    if (phase !== "queued" || waitWant !== "preview" || !createdEntryId) return "";
    const t = tasks.find((x) => x.entryId === createdEntryId && x.kind === "video") ?? null;
    if (!t) return "";

    // What we want here is the "1-min pipeline" indicator:
    // 0→50% recording, 50→100% uploading (poster+preview). Must never go backwards.
    const p01 = (t as any).previewProgress01;
    if (typeof p01 === "number" && Number.isFinite(p01)) {
      const pct = Math.max(0, Math.min(100, Math.floor(p01 * 100)));
      return `${pct}%`;
    }

    return "";
  }, [phase, waitWant, createdEntryId, tasks, queuedTick]);

  useEffect(() => {
    if (phase !== "queued" || waitWant !== "preview") return;
    const id = window.setInterval(() => setQueuedTick((x) => x + 1), 500);
    return () => window.clearInterval(id);
  }, [phase, waitWant]);

  // Restore draft from localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(timelineSlug));
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<Draft>;
      if (d.type) setTypeValue(d.type);
      if (typeof d.title === "string") setTitleValue(d.title);
      if (typeof d.body === "string") setBodyValue(d.body);
      if (typeof d.sourceUrl === "string") setSourceUrlValue(d.sourceUrl);
      if (typeof d.timeStartLocal === "string" && d.timeStartLocal) setTimeStartLocal(d.timeStartLocal);
      if (typeof d.timeEndLocal === "string") setTimeEndLocal(d.timeEndLocal);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineSlug]);

  // Persist draft while editing (files cannot be persisted).
  useEffect(() => {
    try {
      const d: Draft = {
        type: typeValue,
        title: titleValue,
        body: bodyValue,
        sourceUrl: sourceUrlValue,
        timeStartLocal,
        timeEndLocal,
      };
      localStorage.setItem(draftKey(timelineSlug), JSON.stringify(d));
    } catch {
      // ignore
    }
  }, [timelineSlug, typeValue, titleValue, bodyValue, sourceUrlValue, timeStartLocal, timeEndLocal]);

  return (
    <div className="relative">
      {(phase === "creating" || phase === "queued") && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-6 backdrop-blur">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-950/80 p-6 text-center text-zinc-100 shadow-2xl">
            <div className="text-2xl font-black tracking-[0.2em]">
              <PinkK text="reKord" />
            </div>
            <div className="mt-3 text-sm text-zinc-200">
              {phase === "creating"
                ? "Publishing…"
                : waitWant === "preview"
                  ? "Preparing 1-min preview…"
                  : "Uploading media…"}
            </div>
            {/* removed queued file count */}
            {phase === "queued" && waitWant === "preview" ? (
              <div className="mt-4 text-6xl font-black tabular-nums text-pink-400">
                {previewCountdownDisplay}
              </div>
            ) : null}
            <div className="mt-4 text-[11px] text-zinc-400">
              {phase === "queued" && waitWant === "preview"
                ? "Hang tight — we’re uploading a 1‑minute preview so your post can appear right away. You can cancel if you change your mind."
                : phase === "queued"
                  ? "This stays here until the upload is ready. You can cancel to abort posting."
                  : ""}
            </div>
            {phase === "queued" && createdEntryId ? (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-100 hover:bg-white/10"
                  onClick={() => {
                    // Abort any queued/running uploads for this entry.
                    try {
                      for (const t of tasks) {
                        if (t.entryId === createdEntryId && (t.status === "queued" || t.status === "uploading")) {
                          cancel(t.id);
                        }
                      }
                    } catch {
                      // ignore
                    }
                    setMinimized(true);
                    setHidden(false);
                    setPhase("idle");
                    setWaitWant(null);
                    // Keep draft fields intact so the user can adjust and try again.
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {error ? (
        <div className="mt-6 rounded-xl border border-rose-900/40 bg-rose-950/30 p-4 text-sm text-rose-200">
          Create failed: <span className="font-medium">{error}</span>
        </div>
      ) : null}

      <form
        className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);

          const form = e.currentTarget;
          const fd = new FormData(form);

          const type = clampEntryType(String(fd.get("type") ?? typeValue));
          const title = String(fd.get("title") ?? titleValue).trim();
          const body = String(fd.get("body") ?? bodyValue).trim();
          const sourceUrl = String(fd.get("source_url") ?? sourceUrlValue).trim();
          const timeStartUtc = String(fd.get("time_start_utc") ?? "").trim();
          const timeEndUtc = String(fd.get("time_end_utc") ?? "").trim();

          if (!body) {
            setError("missing_body");
            return;
          }

          // Moment requires either a source URL or at least one media upload.
          if (type === "evidence" && !sourceUrl && picked.length === 0) {
            setError("moment_needs_source_or_media");
            return;
          }

          const startDate = new Date(timeStartUtc || String(fd.get("time_start") ?? ""));
          if (Number.isNaN(startDate.getTime())) {
            setError("invalid_time_start");
            return;
          }
          const endDate = timeEndUtc ? new Date(timeEndUtc) : null;
          if (endDate && Number.isNaN(endDate.getTime())) {
            setError("invalid_time_end");
            return;
          }

          setPhase("creating");
          setCreatedEntryId(null);
          setWaitWant(null);

          try {
            const supabase = createSupabaseBrowserClient();
            const { data: userData, error: uErr } = await supabase.auth.getUser();
            if (uErr) throw uErr;
            if (!userData.user) throw new Error("not_signed_in");

            const { data: entry, error: eErr } = await supabase
              .from("entries")
              .insert({
                timeline_id: timelineId,
                type,
                title: title || null,
                body,
                time_start: startDate.toISOString(),
                time_end: endDate ? endDate.toISOString() : null,
                corrects_entry_id: null,
                created_by: userData.user.id,
              } as any)
              .select("id")
              .single();
            if (eErr) throw eErr;

            const entryId = entry.id as string;
            setCreatedEntryId(entryId);

            if (sourceUrl) {
              const { error: sErr } = await supabase.from("sources").insert({
                entry_id: entryId,
                url: sourceUrl,
                source_type: "web",
                added_by: userData.user.id,
              } as any);
              if (sErr) throw sErr;
            }

            if (picked.length === 0) {
              setPhase("idle");
              try {
                localStorage.removeItem(draftKey(timelineSlug));
              } catch {
                // ignore
              }
              router.replace(`/t/${timelineSlug}/e/${entryId}`);
              router.refresh();
              return;
            }

            // Queue uploads globally (continues across navigation).
            setPhase("queued");
            setMinimized(false);

            const pickedVideos = picked.filter((p) => p.file.type.startsWith("video/"));
            let shouldWaitForPreview = false;
            if (pickedVideos.length) {
              const durations = await Promise.all(pickedVideos.map((p) => getVideoDurationSeconds(p.file)));
              shouldWaitForPreview = durations.some((d) => (d ?? 0) >= 180);
            }

            const want: "preview" | "original_video" | "any" = shouldWaitForPreview
              ? "preview"
              : pickedVideos.length
                ? "original_video"
                : "any";
            setWaitWant(want);
            // While the publish overlay is up (esp. waiting for preview), keep the queue widget hidden.
            if (want === "preview") setHidden(true);

            // Start listening BEFORE enqueue to avoid missing fast signals.
            const signalPromise = waitForMediaSignal({
              entryId,
              want,
              timeoutMs: want === "preview" ? 15 * 60 * 1000 : 60 * 60 * 1000,
            });
            const originalSignalPromise = shouldWaitForPreview
              ? waitForMediaSignal({
                  entryId,
                  want: "original_video",
                  timeoutMs: 60 * 60 * 1000,
                })
              : Promise.resolve(false);

            const bucket = "timeline-media";
            for (const pf of picked) {
              const f = pf.file;
              if (!f || !f.size) continue;
              const mime = f.type || "application/octet-stream";
              const kind = kindFromMime(mime);
              const variant = kind === "video" ? "original" : "original";
              const ext = extFromName(f.name);
              const objectPath = `${timelineSlug}/${entryId}/${uuid()}${ext}`;

              enqueue({
                timelineSlug,
                entryId,
                file: f,
                storageBucket: bucket,
                storagePath: objectPath,
                kind,
                variant,
              });
            }

            // Keep the full-screen progress visible until we have the right media attached.
            if (want === "preview") {
              // Prefer preview (so the user sees the post quickly), but if preview is skipped/fails,
              // fall back to waiting for the original upload to complete.
              let got = false;
              try {
                const first = await Promise.any([
                  signalPromise.then((ok) => {
                    if (!ok) throw new Error("no_preview_signal");
                    return "preview";
                  }),
                  originalSignalPromise.then((ok) => {
                    if (!ok) throw new Error("no_original_signal");
                    return "original";
                  }),
                ]);
                got = Boolean(first);
              } catch {
                got = false;
              }

              if (!got) {
                // DB fallback: try preview briefly, then allow original.
                try {
                  await waitForEntryMedia({
                    supabase,
                    entryId,
                    want: "preview",
                    timeoutMs: 2 * 60 * 1000,
                  });
                } catch {
                  await waitForEntryMedia({
                    supabase,
                    entryId,
                    want: "original_video",
                    timeoutMs: 60 * 60 * 1000,
                  });
                }
              }
            } else {
              const gotSignal = await signalPromise;
              if (!gotSignal) {
                await waitForEntryMedia({
                  supabase,
                  entryId,
                  want,
                  timeoutMs: 5 * 60 * 1000,
                });
              }
            }

            // Replace history entry so Back goes to timeline, not /add.
            try {
              localStorage.removeItem(draftKey(timelineSlug));
            } catch {
              // ignore
            }
            setHidden(false);
            router.replace(`/t/${timelineSlug}/e/${entryId}`);
            router.refresh();
            setPhase("idle");
          } catch (err: any) {
            setError(String(err?.message ?? err ?? "unknown_error"));
            setHidden(false);
            setPhase("idle");
          }
        }}
      >
        <label className="text-sm font-medium">Type</label>
        <div id="type">
          <EntryTypePicker
            name="type"
            value={typeValue}
            onChange={(v) => setTypeValue(v)}
            defaultValue="evidence"
          />
        </div>

        <label className="mt-5 block text-sm font-medium" htmlFor="title">
          Title (optional)
        </label>
        <input
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
          id="title"
          name="title"
          placeholder="Short headline"
          dir="auto"
          value={titleValue}
          onChange={(e) => setTitleValue(e.target.value)}
        />

        <label className="mt-5 block text-sm font-medium" htmlFor="body">
          Body
        </label>
        <textarea
          className="mt-2 w-full resize-none rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
          id="body"
          name="body"
          placeholder="What happened? Add context and keep it clear."
          rows={6}
          required
          dir="auto"
          value={bodyValue}
          onChange={(e) => setBodyValue(e.target.value)}
        />

        <TimeRangePicker
          initialStartLocal={timeStartLocal}
          initialEndLocal={timeEndLocal}
          onChange={(v) => {
            setTimeStartLocal(v.startLocal);
            setTimeEndLocal(v.endLocal);
          }}
        />

        <label className="mt-5 block text-sm font-medium" htmlFor="source_url">
          Source URL (optional · Moment needs source OR media)
        </label>
        <input
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
          id="source_url"
          name="source_url"
          placeholder="https://…"
          type="url"
          value={sourceUrlValue}
          onChange={(e) => setSourceUrlValue(e.target.value)}
        />

        <div className="mt-5">
          <label className="text-sm font-medium">Media (optional)</label>
          <div className="mt-1 text-xs text-zinc-400">
            Choose images, video, or audio.
          </div>
          <MediaPicker accept="image/*,video/*,audio/*" onPickedChange={setPicked} />
        </div>

        <button
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={phase !== "idle"}
          type="submit"
        >
          {phase === "idle" ? "Publish" : "Publishing…"}
        </button>
      </form>
    </div>
  );
}

